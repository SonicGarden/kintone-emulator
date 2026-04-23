import sqlParser from 'node-sql-parser';
import { dbSession } from "../db/client";
import { findFields, findFieldTypes } from "../db/fields";
import type { FieldRow, FieldTypeRow } from "../db/fields";
import { deleteRecords, findRecord, findRecordByKey, findRecords, findRecordsByClause, insertRecord, updateRecord } from "../db/records";
import type { RecordRow } from "../db/records";
import { errorInvalidInput, errorMessages, errorNotFoundRecord } from "./errors";
import { applyLookups } from "./lookup";
import type { HandlerArgs } from "./types";
import type { ValidationErrors } from "./validate";
import { applyDefaults, attachFieldTypes, detectLocale, mergeSubtableRows, normalizeNumbers, validateRecord } from "./validate";

type FieldTypes = { [key: string]: FieldTypeRow["type"] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const replaceField = (param: { expression: any, fieldTypes: FieldTypes }) => {
  const { expression, fieldTypes } = param;
  switch (expression.type) {
    case 'binary_expr':
      replaceField({ expression: expression.left, fieldTypes });
      replaceField({ expression: expression.right, fieldTypes });
      break;
    case 'column_ref':
      switch (fieldTypes[expression.column]) {
        case 'CREATED_TIME':
        case 'UPDATED_TIME':
        case 'DATETIME':
          expression.column = `datetime(body->>'$.${expression.column}.value', '+9 hours')`;
          break;
        case 'DATE':
          expression.column = `date(body->>'$.${expression.column}.value', '+9 hours')`;
          break;
        default:
          expression.column = `body->>'$.${expression.column}.value'`;
          break;
      }
      break;
    case 'var':
      if (expression.name === 'id' && expression.prefix === '$') {
        delete expression.prefix;
        delete expression.name;
        delete expression.members;
        expression.type = 'column_ref';
        expression.column = 'id';
        expression.table = null;
      }
      break;
    case 'function':
      switch (expression.name.name[0].value) {
        case 'NOW':
          expression.name.name[0].value = 'datetime';
          expression.args.value = [{ type: 'single_quote_string', value: 'now' }, { type: 'single_quote_string', value: '+9 hours' }];
          break;
      }
  }
};

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

const hasWhereClause = (query: string) =>
  !query.trim().toLowerCase().startsWith('order')
  && !query.trim().toLowerCase().startsWith('limit')
  && !query.trim().toLowerCase().startsWith('offset');

const replaceUniCodeField = (query: string) => {
  const includedJp = /(?<!['"\u30a0-\u30ff\u3040-\u309f\u3005-\u3006\u30e0-\u9fcf])\w*[\u30a0-\u30ff\u3040-\u309f\u3005-\u3006\u30e0-\u9fcf]+\w*(?!['"])/g;
  return query.replace(includedJp, (match) => `\`${match}\``);
};

export const get = ({ request, params }: HandlerArgs) => {
  try {
    const db = dbSession(params.session);
    const url = new URL(request.url);
    const app = url.searchParams.get('app');
    const rawQuery = url.searchParams.get('query');
    const query = rawQuery ? replaceUniCodeField(rawQuery).replaceAll('"', "'") : null;
    const fields: string[] = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (key.startsWith('fields')) {
        fields.push(value);
      }
    }

    const fieldTypeRows = findFieldTypes(db, app!);
    const fieldTypes: FieldTypes = {};
    for (const row of fieldTypeRows) {
      fieldTypes[row.code] = row.type;
    }
    const fieldRows = findFields(db, app!);

    if (query === null) {
      const recordResult = findRecords(db, app);
      return Response.json({
        totalCount: recordResult.length.toString(),
        records: generateRecords({ recordResult, fieldRows, fields }),
      });
    }

    const parser = new sqlParser.Parser();
    const prefixSql = `select 1 from records ${hasWhereClause(query) ? 'where ' : ''}`;
    const ast = parser.astify(prefixSql + query);

    if ('where' in ast && ast.where !== null) {
      replaceField({ expression: ast.where, fieldTypes });
    }
    if ('orderby' in ast && ast.orderby !== null) {
      for (const order of ast.orderby) {
        replaceField({ expression: order.expr, fieldTypes });
      }
    }

    const newQuery = parser.sqlify(ast, { database: 'sqlite' });
    const clause = newQuery.replaceAll('"', '').replace(/SELECT 1 FROM records (WHERE)?/g, '');

    try {
      const recordResult = findRecordsByClause(db, app, clause, hasWhereClause(query));
      return Response.json({
        totalCount: recordResult.length.toString(),
        records: generateRecords({ recordResult, fieldRows, fields }),
      });
    } catch (e) {
      return Response.json(
        { id: '1505999166-897850006', code: 'CB_VA01', message: 'query: クエリ記法が間違っています。' },
        { status: 400 }
      );
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

// record.ts の PUT と同じパターン（updateKey.field の SQL injection ガード）
const FIELD_CODE_PATTERN = /^[\w\u3000-\u9fff\uff00-\uffef]+$/;

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
