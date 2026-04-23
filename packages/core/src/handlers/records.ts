import { all, dbSession } from "../db/client";
import { findFields } from "../db/fields";
import type { FieldRow } from "../db/fields";
import { deleteRecords, findRecord, findRecordByKey, insertRecord, updateRecord } from "../db/records";
import type { RecordRow } from "../db/records";
import { ParseError, TokenizeError, compile, parseQuery } from "../query";
import type { FieldTypeMap } from "../query";
import { errorInvalidInput, errorMessages, errorNotFoundRecord } from "./errors";
import { applyLookups } from "./lookup";
import type { HandlerArgs } from "./types";
import type { ValidationErrors } from "./validate";
import { applyDefaults, attachFieldTypes, detectLocale, mergeSubtableRows, normalizeNumbers, validateRecord } from "./validate";

const generateRecords = ({ recordResult, fieldRows, fields }: {
  recordResult: RecordRow[],
  fieldRows: FieldRow[],
  fields: string[]
}) => {
  return recordResult.map((record) => {
    const body = JSON.parse(record.body);
    attachFieldTypes(body, fieldRows, {
      recordId: record.id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
    if (fields.length > 0) {
      for (const key in body) {
        if (!fields.includes(key)) {
          delete body[key];
        }
      }
    }
    body['$revision'] = { value: record.revision.toString(), type: '__REVISION__' };
    body['$id'] = { value: record.id.toString(), type: '__ID__' };
    return body;
  });
};

// フィールドコードとして許容する非 ASCII 文字の Unicode 範囲:
//   \u3005-\u3006 : 繰り返し記号「々」「〆」
//   \u3040-\u30ff : ひらがな + カタカナ のブロック
//   \u4e00-\u9fff : 基本 CJK 漢字ブロック
//   \uff00-\uffef : 全角英数字・記号・半角カナ等
export const NON_ASCII_FIELD_CODE_CHARS = "\\u3005-\\u3006\\u3040-\\u30ff\\u4e00-\\u9fff\\uff00-\\uffef";

// フィールドコード全体の許容文字集合（updateKey.field の SQL injection ガード用）
export const FIELD_CODE_PATTERN = new RegExp(`^[\\w${NON_ASCII_FIELD_CODE_CHARS}]+$`);

export const get = ({ request, params }: HandlerArgs) => {
  try {
    const db = dbSession(params.session);
    const url = new URL(request.url);
    const app = url.searchParams.get('app');
    const rawQuery = url.searchParams.get('query');
    const fields: string[] = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (key.startsWith('fields')) {
        fields.push(value);
      }
    }

    const fieldRows = findFields(db, app!);
    const fieldTypes: FieldTypeMap = {};
    for (const row of fieldRows) {
      fieldTypes[row.code] = (JSON.parse(row.body) as { type: string }).type;
    }

    const locale = detectLocale(request.headers.get("accept-language"));
    try {
      // 実 kintone は query 省略 / 空でも $id desc がデフォルト順序。
      // compile 側のデフォルト ORDER BY (id DESC) に乗せるため、空クエリを parse する。
      const ast = parseQuery(rawQuery ?? "");
      // limit / offset の上限チェック（実機: limit=500 / offset=10000）
      if (ast.limit != null && ast.limit > 500) {
        return Response.json(
          {
            code: "GAIA_QU01",
            id: "emulator-query-limit",
            message: locale === "en"
              ? "limit must be 500 or less."
              : "limit には 500 以下の値を指定してください。",
          },
          { status: 400 },
        );
      }
      if (ast.offset != null && ast.offset > 10000) {
        return Response.json(
          {
            code: "GAIA_QU02",
            id: "emulator-query-offset",
            message: locale === "en"
              ? "offset must be 10,000 or less."
              : "offset には 10,000 以下の値を指定してください。",
          },
          { status: 400 },
        );
      }
      if ((ast.limit != null && ast.limit < 0) || (ast.offset != null && ast.offset < 0)) {
        return errorInvalidInput({}, locale);
      }
      const compiled = compile(ast, { fieldTypes });
      const whereClause = compiled.where ? `AND ${compiled.where}` : "";
      const orderClause = compiled.orderBy ? `ORDER BY ${compiled.orderBy}` : "";
      const limitClause = compiled.limit != null ? `LIMIT ${compiled.limit}` : "";
      const offsetClause = compiled.offset != null ? `OFFSET ${compiled.offset}` : "";
      const sql = [
        "SELECT id, revision, body, created_at, updated_at FROM records WHERE app_id = ?",
        whereClause,
        orderClause,
        limitClause,
        offsetClause,
      ].filter(Boolean).join(" ");
      const recordResult = all<RecordRow>(db, sql, app, ...compiled.params);
      return Response.json({
        totalCount: recordResult.length.toString(),
        records: generateRecords({ recordResult, fieldRows, fields }),
      });
    } catch (e) {
      if (e instanceof ParseError || e instanceof TokenizeError) {
        // 実機準拠: errors.query.messages に詳細メッセージを入れて CB_VA01 / 400
        return errorInvalidInput(
          { query: { messages: [locale === "en" ? "The query is invalid." : "クエリ記法が間違っています。"] } },
          locale,
        );
      }
      return Response.json({ code: 'error', message: String(e) }, { status: 500 });
    }
  } catch (e) {
    return Response.json({ code: 'error', message: String(e) }, { status: 500 });
  }
};

// 一括 API の上限
const BULK_LIMIT = 100;

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

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);

  if (body.app == null) {
    return errorInvalidInput({ app: { messages: [m.requiredField] } }, locale);
  }
  const records: Array<Record<string, { value?: unknown }>> = body.records ?? [];
  if (records.length > BULK_LIMIT) {
    return errorInvalidInput({ records: { messages: [BULK_LIMIT_MESSAGES.add[locale]] } }, locale);
  }

  const fieldRows = findFields(db, body.app);

  // 1) 全件をまず validate してエラー集約
  const allErrors: ValidationErrors = {};
  const prepared: Array<Record<string, { value?: unknown }>> = [];
  for (let i = 0; i < records.length; i++) {
    const withDefaults = applyDefaults(fieldRows, records[i]!);
    const lookupResult = applyLookups(fieldRows, withDefaults, { db, locale });
    // 実 kintone の一括 API は 1 件目のルックアップエラーで即終了（errors に index 情報は含まれない）
    if (lookupResult.error) return lookupResult.error;
    const normalized = normalizeNumbers(fieldRows, lookupResult.record);
    prepared.push(normalized);
    const errors = validateRecord(fieldRows, normalized, { db, appId: body.app, locale });
    if (errors) Object.assign(allErrors, prefixErrorKeys(errors, i));
  }
  if (Object.keys(allErrors).length > 0) return errorInvalidInput(allErrors, locale);

  // 2) 全件挿入をトランザクションで実行（いずれか失敗したら全件ロールバック）
  try {
    const result = db.transaction(() => {
      const ids: string[] = [];
      const revisions: string[] = [];
      for (const rec of prepared) {
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

type UpdateRecordInput = {
  id?: string | number;
  updateKey?: { field: string; value: string };
  record: Record<string, { value?: unknown }>;
  revision?: string | number;
};

// updateKey.field の SQL injection ガードは、ファイル先頭で定義した
// FIELD_CODE_PATTERN（クエリ内の識別子として許容するのと同じ文字集合）を使う

export const put = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);

  if (body.app == null) {
    return errorInvalidInput({ app: { messages: [m.requiredField] } }, locale);
  }
  const records: UpdateRecordInput[] = body.records ?? [];
  if (records.length > BULK_LIMIT) {
    return errorInvalidInput({ records: { messages: [BULK_LIMIT_MESSAGES.update[locale]] } }, locale);
  }

  const fieldRows = findFields(db, body.app);

  // 1) 各レコードの対象特定 + validate
  type Prepared = { targetId: number; merged: Record<string, { value?: unknown }> };
  const prepared: Prepared[] = [];
  const allErrors: ValidationErrors = {};
  for (let i = 0; i < records.length; i++) {
    const item = records[i]!;
    let target: ReturnType<typeof findRecord>;
    if (item.updateKey) {
      if (!FIELD_CODE_PATTERN.test(item.updateKey.field)) {
        return Response.json({ message: 'Invalid field code.' }, { status: 400 });
      }
      target = findRecordByKey(db, body.app, item.updateKey.field, item.updateKey.value);
    } else {
      target = findRecord(db, body.app, item.id != null ? String(item.id) : null);
    }
    if (!target) {
      return errorNotFoundRecord(item.updateKey ? item.updateKey.value : (item.id ?? ""), locale);
    }

    const existingBody = JSON.parse(target.body);
    const incoming = mergeSubtableRows(fieldRows, existingBody, item.record);
    const lookupResult = applyLookups(fieldRows, incoming, { db, locale });
    if (lookupResult.error) return lookupResult.error;
    const merged = normalizeNumbers(fieldRows, { ...existingBody, ...lookupResult.record });
    const errors = validateRecord(fieldRows, merged, {
      db, appId: body.app, excludeId: target.id, locale,
    });
    if (errors) Object.assign(allErrors, prefixErrorKeys(errors, i));
    prepared.push({ targetId: target.id, merged });
  }
  if (Object.keys(allErrors).length > 0) return errorInvalidInput(allErrors, locale);

  // 2) 全件更新をトランザクションで
  try {
    const result = db.transaction(() => {
      const updated: Array<{ id: string; revision: string }> = [];
      for (const { targetId, merged } of prepared) {
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

// NOTE: kintone APIは `revisions` パラメーターで楽観的ロックをサポートするが、
// このエミュレーターでは無視する。
export const del = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);

  const app = url.searchParams.get('app');
  const ids: string[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('ids')) {
      ids.push(value);
    }
  }

  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);
  if (!app || ids.length === 0) {
    const missing: { [key: string]: { messages: string[] } } = {};
    if (!app) missing.app = { messages: [m.requiredField] };
    if (ids.length === 0) missing.ids = { messages: [m.requiredField] };
    return errorInvalidInput(missing, locale);
  }

  deleteRecords(db, app, ids);
  return Response.json({});
};
