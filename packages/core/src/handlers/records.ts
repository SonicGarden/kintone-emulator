import { computeCalcFields } from "../calc/compute";
import { all, dbSession } from "../db/client";
import { findFields } from "../db/fields";
import type { FieldRow } from "../db/fields";
import { deleteRecords, findRecord, findRecordByKey, insertRecord, updateRecord } from "../db/records";
import type { RecordRow } from "../db/records";
import { ParseError, TokenizeError, compile, parseQuery } from "../query";
import type { CompileContext, FieldOptionsMap, FieldTypeMap, Query, SubtableFieldMap } from "../query";
import { CompileError } from "../query/compiler";
import { errorInvalidInput, errorMessages, errorNotFoundRecord } from "./errors";
import { enforceGuestSpace } from "./guest-space";
import { applyLookups } from "./lookup";
import type { HandlerArgs } from "./types";
import type { ValidationErrors } from "./validate";
import { applyDefaults, attachFieldTypes, detectLocale, formatKintoneDateTime, mergeSubtableRows, normalizeDropDown, normalizeNumbers, validateRecord } from "./validate";

// ============================================================
// フィールドコード
// ============================================================

// フィールドコードとして許容する非 ASCII 文字の Unicode 範囲:
//   \u3005-\u3006 : 繰り返し記号「々」「〆」
//   \u3040-\u30ff : ひらがな + カタカナ のブロック
//   \u4e00-\u9fff : 基本 CJK 漢字ブロック
//   \uff00-\uffef : 全角英数字・記号・半角カナ等
export const NON_ASCII_FIELD_CODE_CHARS = "\\u3005-\\u3006\\u3040-\\u30ff\\u4e00-\\u9fff\\uff00-\\uffef";

// フィールドコード全体の許容文字集合（updateKey.field の SQL injection ガード用）
export const FIELD_CODE_PATTERN = new RegExp(`^[\\w${NON_ASCII_FIELD_CODE_CHARS}]+$`);

// ============================================================
// 一括 API 共通
// ============================================================

// 一括 API の上限
const BULK_LIMIT = 100;

const BULK_LIMIT_MESSAGES = {
  add: {
    ja: "一度に100件までのレコードを追加できます。",
    en: "A maximum of 100 records can be added at one time.",
  },
  update: {
    ja: "一度に100件までのレコードを更新できます。",
    en: "A maximum of 100 records can be updated at one time.",
  },
} as const;

// 単体レコード検証エラーのキーを一括 API 用にリネーム
// "record.<code>.value" → "records[<i>].<code>.value"
// "record[<code>].value" → "records[<i>][<code>].value"
const prefixErrorKeys = (errors: ValidationErrors, index: number): ValidationErrors => {
  const result: ValidationErrors = {};
  for (const [key, v] of Object.entries(errors)) {
    let newKey = key;
    if (key.startsWith("record.")) {
      newKey = `records[${index}].` + key.slice("record.".length);
    } else if (key.startsWith("record[")) {
      newKey = `records[${index}][` + key.slice("record[".length);
    }
    result[newKey] = v;
  }
  return result;
};

// ============================================================
// GET: レコード一覧取得（クエリ）
// ============================================================

type ListQueryParams = { app: string | null; rawQuery: string | null; fields: string[] };

const parseListParams = (request: Request): ListQueryParams => {
  const url = new URL(request.url);
  const fields: string[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith("fields")) fields.push(value);
  }
  return {
    app: url.searchParams.get("app"),
    rawQuery: url.searchParams.get("query"),
    fields,
  };
};

/** フィールド定義行から、compile に渡すクエリコンテキストを組み立てる */
const buildQueryContext = (fieldRows: FieldRow[]): CompileContext => {
  const fieldTypes: FieldTypeMap = {};
  const subtableFields: SubtableFieldMap = {};
  const fieldOptions: FieldOptionsMap = {};
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as {
      type: string;
      fields?: Record<string, { type: string }>;
      options?: Record<string, unknown>;
    };
    fieldTypes[row.code] = def.type;
    if (def.type === "SUBTABLE" && def.fields) {
      for (const [innerCode, innerDef] of Object.entries(def.fields)) {
        subtableFields[innerCode] = { subtableCode: row.code, type: innerDef.type };
      }
    }
    if (def.options) {
      fieldOptions[row.code] = new Set(Object.keys(def.options));
    }
  }
  return { fieldTypes, subtableFields, fieldOptions };
};

/** AST の limit / offset が実機の上限（500 / 10000）を超えていないか検証 */
const validateQueryLimits = (ast: Query, locale: "ja" | "en"): Response | null => {
  if (ast.limit != null && ast.limit > 500) {
    return Response.json({
      code: "GAIA_QU01",
      id: "emulator-query-limit",
      message: locale === "en" ? "limit must be 500 or less." : "limit には 500 以下の値を指定してください。",
    }, { status: 400 });
  }
  if (ast.offset != null && ast.offset > 10000) {
    return Response.json({
      code: "GAIA_QU02",
      id: "emulator-query-offset",
      message: locale === "en" ? "offset must be 10,000 or less." : "offset には 10,000 以下の値を指定してください。",
    }, { status: 400 });
  }
  if ((ast.limit != null && ast.limit < 0) || (ast.offset != null && ast.offset < 0)) {
    return errorInvalidInput({}, locale);
  }
  return null;
};

/** コンパイル済みの WHERE / ORDER / LIMIT / OFFSET を SQL に組み立てて実行 */
const runListQuery = (
  db: ReturnType<typeof dbSession>,
  app: string,
  compiled: ReturnType<typeof compile>,
): RecordRow[] => {
  const whereClause = compiled.where ? `AND ${compiled.where}` : "";
  const orderClause = compiled.orderBy ? `ORDER BY ${compiled.orderBy}` : "";
  const limitClause = compiled.limit != null ? `LIMIT ${compiled.limit}` : "";
  const offsetClause = compiled.offset != null ? `OFFSET ${compiled.offset}` : "";
  const sql = [
    "SELECT id, revision, body, created_at, updated_at FROM records WHERE app_id = ?",
    whereClause, orderClause, limitClause, offsetClause,
  ].filter(Boolean).join(" ");
  return all<RecordRow>(db, sql, app, ...compiled.params);
};

/** DB レコード行を API レスポンス形式のフィールド付きオブジェクトに変換 */
const toResponseRecords = (rows: RecordRow[], fieldRows: FieldRow[], fields: string[]) =>
  rows.map((record) => {
    const body = JSON.parse(record.body);
    attachFieldTypes(body, fieldRows, {
      recordId: record.id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
    if (fields.length > 0) {
      for (const key in body) {
        if (!fields.includes(key)) delete body[key];
      }
    }
    body["$revision"] = { value: record.revision.toString(), type: "__REVISION__" };
    body["$id"] = { value: record.id.toString(), type: "__ID__" };
    return body;
  });

/** parse / compile / SQL 実行で出る例外を実機準拠のエラーレスポンスに変換 */
const queryErrorResponse = (e: unknown, locale: "ja" | "en"): Response => {
  if (e instanceof ParseError || e instanceof TokenizeError) {
    return errorInvalidInput(
      { query: { messages: [locale === "en" ? "The query is invalid." : "クエリ記法が間違っています。"] } },
      locale,
    );
  }
  if (e instanceof CompileError) {
    return Response.json(
      { code: e.code, id: "emulator-query-compile-error", message: e.message },
      { status: 400 },
    );
  }
  return Response.json({ code: "error", message: String(e) }, { status: 500 });
};

export const get = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const { app, rawQuery, fields } = parseListParams(request);
  const locale = detectLocale(request.headers.get("accept-language"));

  if (!app) {
    return errorInvalidInput({ app: { messages: [errorMessages(locale).requiredField] } }, locale);
  }

  const guestErr = enforceGuestSpace(db, app, params.guestSpaceId, locale);
  if (guestErr) return guestErr;

  const fieldRows = findFields(db, app);
  const queryCtx = buildQueryContext(fieldRows);

  try {
    const ast = parseQuery(rawQuery ?? "");
    const limitError = validateQueryLimits(ast, locale);
    if (limitError) return limitError;

    const compiled = compile(ast, queryCtx);
    const rows = runListQuery(db, app, compiled);
    return Response.json({
      totalCount: rows.length.toString(),
      records: toResponseRecords(rows, fieldRows, fields),
    });
  } catch (e) {
    return queryErrorResponse(e, locale);
  }
};

// ============================================================
// POST: レコード一括追加
// ============================================================

/** 一括追加前処理: 全件の defaults / lookup / normalize を済ませ、エラーをすべて集約 */
const prepareRecordsForInsert = (
  fieldRows: FieldRow[],
  records: Array<Record<string, { value?: unknown }>>,
  ctx: { db: ReturnType<typeof dbSession>; appId: string; locale: "ja" | "en" },
): { prepared: Array<Record<string, { value?: unknown }>>; errors: ValidationErrors } | { lookupError: Response } => {
  const prepared: Array<Record<string, { value?: unknown }>> = [];
  const errors: ValidationErrors = {};
  for (let i = 0; i < records.length; i++) {
    const withDefaults = applyDefaults(fieldRows, records[i]!);
    const lookupResult = applyLookups(fieldRows, withDefaults, { db: ctx.db, locale: ctx.locale });
    // 実 kintone の一括 API は 1 件目のルックアップエラーで即終了（errors に index 情報は含まれない）
    if (lookupResult.error) return { lookupError: lookupResult.error };
    const normalized = normalizeDropDown(fieldRows, normalizeNumbers(fieldRows, lookupResult.record));
    prepared.push(normalized);
    const perRecordErrors = validateRecord(fieldRows, normalized, {
      db: ctx.db, appId: ctx.appId, locale: ctx.locale,
    });
    if (perRecordErrors) Object.assign(errors, prefixErrorKeys(perRecordErrors, i));
  }
  return { prepared, errors };
};

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);

  if (body.app == null) {
    return errorInvalidInput({ app: { messages: [m.requiredField] } }, locale);
  }
  const guestErrPost = enforceGuestSpace(db, body.app, params.guestSpaceId, locale);
  if (guestErrPost) return guestErrPost;
  const records: Array<Record<string, { value?: unknown }>> = body.records ?? [];
  if (records.length > BULK_LIMIT) {
    return errorInvalidInput({ records: { messages: [BULK_LIMIT_MESSAGES.add[locale]] } }, locale);
  }

  const fieldRows = findFields(db, body.app);
  const prep = prepareRecordsForInsert(fieldRows, records, { db, appId: body.app, locale });
  if ("lookupError" in prep) return prep.lookupError;
  if (Object.keys(prep.errors).length > 0) return errorInvalidInput(prep.errors, locale);

  try {
    const result = db.transaction(() => {
      const ids: string[] = [];
      const revisions: string[] = [];
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      for (const rec of prep.prepared) {
        computeCalcFields(fieldRows, rec, { createdAt: now, updatedAt: now });
        const inserted = insertRecord(db, body.app, rec);
        if (!inserted) throw new Error("insert failed");
        ids.push(inserted.id.toString());
        revisions.push(inserted.revision.toString());
      }
      return { ids, revisions };
    })();
    return Response.json(result);
  } catch {
    return Response.json({ message: "Failed to create records." }, { status: 500 });
  }
};

// ============================================================
// PUT: レコード一括更新
// ============================================================

type UpdateRecordInput = {
  id?: string | number;
  updateKey?: { field: string; value: string };
  record: Record<string, { value?: unknown }>;
  revision?: string | number;
};

/** id / updateKey から既存レコード行を特定する。見つからなければエラーレスポンスを返す */
const resolveUpdateTarget = (
  db: ReturnType<typeof dbSession>,
  appId: string,
  item: UpdateRecordInput,
  locale: "ja" | "en",
): { target: NonNullable<ReturnType<typeof findRecord>> } | { error: Response } => {
  if (item.updateKey) {
    if (!FIELD_CODE_PATTERN.test(item.updateKey.field)) {
      return { error: Response.json({ message: "Invalid field code." }, { status: 400 }) };
    }
    const target = findRecordByKey(db, appId, item.updateKey.field, item.updateKey.value);
    if (!target) return { error: errorNotFoundRecord(item.updateKey.value, locale) };
    return { target };
  }
  const target = findRecord(db, appId, item.id != null ? String(item.id) : null);
  if (!target) return { error: errorNotFoundRecord(item.id ?? "", locale) };
  return { target };
};

type PreparedUpdate = { targetId: number; createdAt: string; merged: Record<string, { value?: unknown }> };

/** 一括更新前処理: 各レコードの対象特定 + マージ + validate を行い、エラーを集約 */
const prepareRecordsForUpdate = (
  fieldRows: FieldRow[],
  records: UpdateRecordInput[],
  ctx: { db: ReturnType<typeof dbSession>; appId: string; locale: "ja" | "en" },
): { prepared: PreparedUpdate[]; errors: ValidationErrors } | { error: Response } => {
  const prepared: PreparedUpdate[] = [];
  const errors: ValidationErrors = {};
  for (let i = 0; i < records.length; i++) {
    const item = records[i]!;
    const resolved = resolveUpdateTarget(ctx.db, ctx.appId, item, ctx.locale);
    if ("error" in resolved) return { error: resolved.error };
    const { target } = resolved;

    const existingBody = JSON.parse(target.body);
    const incoming = mergeSubtableRows(fieldRows, existingBody, item.record);
    const lookupResult = applyLookups(fieldRows, incoming, { db: ctx.db, locale: ctx.locale });
    if (lookupResult.error) return { error: lookupResult.error };
    const merged = normalizeDropDown(fieldRows, normalizeNumbers(fieldRows, { ...existingBody, ...lookupResult.record }));
    const perRecordErrors = validateRecord(fieldRows, merged, {
      db: ctx.db, appId: ctx.appId, excludeId: target.id, locale: ctx.locale,
    });
    if (perRecordErrors) Object.assign(errors, prefixErrorKeys(perRecordErrors, i));
    prepared.push({ targetId: target.id, createdAt: target.created_at, merged });
  }
  return { prepared, errors };
};

export const put = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);

  if (body.app == null) {
    return errorInvalidInput({ app: { messages: [m.requiredField] } }, locale);
  }
  const guestErrPut = enforceGuestSpace(db, body.app, params.guestSpaceId, locale);
  if (guestErrPut) return guestErrPut;
  const records: UpdateRecordInput[] = body.records ?? [];
  if (records.length > BULK_LIMIT) {
    return errorInvalidInput({ records: { messages: [BULK_LIMIT_MESSAGES.update[locale]] } }, locale);
  }

  const fieldRows = findFields(db, body.app);
  const prep = prepareRecordsForUpdate(fieldRows, records, { db, appId: body.app, locale });
  if ("error" in prep) return prep.error;
  if (Object.keys(prep.errors).length > 0) return errorInvalidInput(prep.errors, locale);

  try {
    const result = db.transaction(() => {
      const updated: Array<{ id: string; revision: string }> = [];
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      for (const { targetId, createdAt, merged } of prep.prepared) {
        computeCalcFields(fieldRows, merged, {
          createdAt: formatKintoneDateTime(createdAt),
          updatedAt: now,
        });
        const u = updateRecord(db, body.app, String(targetId), merged);
        if (!u) throw new Error("update failed");
        updated.push({ id: u.id.toString(), revision: u.revision.toString() });
      }
      return { records: updated };
    })();
    return Response.json(result);
  } catch {
    return Response.json({ message: "Failed to update records." }, { status: 500 });
  }
};

// ============================================================
// DELETE: レコード一括削除
// ============================================================

// NOTE: kintone APIは `revisions` パラメーターで楽観的ロックをサポートするが、
// このエミュレーターでは無視する。
export const del = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);

  const app = url.searchParams.get("app");
  const ids: string[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith("ids")) ids.push(value);
  }

  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);
  if (!app || ids.length === 0) {
    const missing: { [key: string]: { messages: string[] } } = {};
    if (!app) missing.app = { messages: [m.requiredField] };
    if (ids.length === 0) missing.ids = { messages: [m.requiredField] };
    return errorInvalidInput(missing, locale);
  }

  const guestErr = enforceGuestSpace(db, app, params.guestSpaceId, locale);
  if (guestErr) return guestErr;

  // 実機準拠: 指定 ID に存在しないものが含まれていたら GAIA_RE01 で拒否し、削除は一切行わない
  for (const id of ids) {
    if (!findRecord(db, app, id)) return errorNotFoundRecord(id, locale);
  }
  deleteRecords(db, app, ids);
  return Response.json({});
};
