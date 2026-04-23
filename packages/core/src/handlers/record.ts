import type { KintoneRecordField } from '@kintone/rest-api-client';
import { dbSession } from "../db/client";
import { findFields } from "../db/fields";
import { findRecord, findRecordByKey, insertRecord, updateRecord } from "../db/records";
import { errorInvalidInput, errorMessages, errorNotFoundRecord } from "./errors";
import { applyLookups } from "./lookup";
import type { HandlerArgs } from "./types";
import { applyDefaults, attachFieldTypes, detectLocale, mergeSubtableRows, normalizeNumbers, validateRecord, validationErrorResponse } from "./validate";

type Record = {
  [fieldCode: string]: KintoneRecordField.OneOf;
}

export const get = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const app = url.searchParams.get('app');
  const id = url.searchParams.get('id');
  const locale = detectLocale(request.headers.get("accept-language"));

  const m = errorMessages(locale);
  if (!app || !id) {
    const missing: { [key: string]: { messages: string[] } } = {};
    if (!app) missing.app = { messages: [m.requiredField] };
    if (!id)  missing.id  = { messages: [m.requiredField] };
    return errorInvalidInput(missing, locale);
  }

  const row = findRecord(db, app, id);
  if (!row) {
    return errorNotFoundRecord(id, locale);
  }

  const body: Record = JSON.parse(row.body);
  const fieldRows = findFields(db, app);
  attachFieldTypes(body, fieldRows, row.id);
  body['$id'] = { value: row.id.toString(), type: '__ID__' };
  body['$revision'] = { value: row.revision.toString(), type: '__REVISION__' };
  return Response.json({ record: body });
};

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);

  const locale = detectLocale(request.headers.get("accept-language"));
  const fieldRows = findFields(db, body.app);
  const withDefaults = applyDefaults(fieldRows, body.record ?? {});
  const lookupResult = applyLookups(fieldRows, withDefaults, { db, locale });
  if (lookupResult.error) return lookupResult.error;
  const record = normalizeNumbers(fieldRows, lookupResult.record);
  const errors = validateRecord(fieldRows, record, { db, appId: body.app, locale });
  if (errors) return validationErrorResponse(errors, locale);

  const inserted = insertRecord(db, body.app, record);
  if (!inserted) {
    return Response.json({ message: 'Failed to create record.' }, { status: 500 });
  }
  return Response.json({
    id: inserted.id.toString(),
    revision: inserted.revision.toString(),
  });
};

// フィールドコードに使用可能な文字: ASCII英数字・アンダースコア(\w)、ひらがな・カタカナ・漢字(\u3000-\u9fff)、全角英数字・記号(\uff00-\uffef)
// SQL の JSON path 式にフィールドコードを直接埋め込むため、クォートや = など SQL で意味を持つ文字を弾く
const FIELD_CODE_PATTERN = /^[\w\u3000-\u9fff\uff00-\uffef]+$/;

export const put = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);

  let target: ReturnType<typeof findRecord>;
  if (body.updateKey) {
    if (!FIELD_CODE_PATTERN.test(body.updateKey.field)) {
      return Response.json({ message: 'Invalid field code.' }, { status: 400 });
    }
    target = findRecordByKey(db, body.app, body.updateKey.field, body.updateKey.value);
  } else {
    target = findRecord(db, body.app, body.id);
  }

  if (!target) {
    return errorNotFoundRecord(body.updateKey ? body.updateKey.value : body.id, detectLocale(request.headers.get("accept-language")));
  }

  const locale = detectLocale(request.headers.get("accept-language"));
  const fieldRows = findFields(db, body.app);
  const existingBody = JSON.parse(target.body);
  // SUBTABLE 行は id マッチで既存とマージ、id 無しは新規採番、送信配列にない既存行は削除
  const incomingRecord = mergeSubtableRows(fieldRows, existingBody, body.record ?? {});
  // ルックアップ: body.record 側でキーが変わったらコピー先を再計算
  const lookupResult = applyLookups(fieldRows, incomingRecord, { db, locale });
  if (lookupResult.error) return lookupResult.error;
  const beforeNormalize = { ...existingBody, ...lookupResult.record };
  const mergedRecord = normalizeNumbers(fieldRows, beforeNormalize);

  const errors = validateRecord(fieldRows, mergedRecord, {
    db,
    appId: body.app,
    excludeId: target.id,
    locale,
  });
  if (errors) return validationErrorResponse(errors, locale);

  const updated = updateRecord(db, body.app, String(target.id), mergedRecord);
  if (!updated) {
    return errorNotFoundRecord(target.id, locale);
  }
  return Response.json({
    id: updated.id.toString(),
    revision: updated.revision.toString(),
  });
};
