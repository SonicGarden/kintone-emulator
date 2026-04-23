import type { KintoneRecordField } from '@kintone/rest-api-client';
import { dbSession } from "../db/client";
import { findFields, findFieldTypes } from "../db/fields";
import { findRecord, findRecordByKey, insertRecord, updateRecord } from "../db/records";
import type { HandlerArgs } from "./types";
import { applyDefaults, detectLocale, validateRecord, validationErrorResponse } from "./validate";

type Record = {
  [fieldCode: string]: KintoneRecordField.OneOf;
}

export const get = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const app = url.searchParams.get('app');

  const row = findRecord(db, app, url.searchParams.get('id'));
  if (!row) {
    return Response.json({ message: 'Record not found.' }, { status: 404 });
  }

  const body: Record = JSON.parse(row.body);
  const fieldTypes = findFieldTypes(db, app!);
  for (const field of fieldTypes) {
    if (body[field.code]) {
      body[field.code]!.type = field.type;
    }
  }
  body['$id'] = { value: row.id.toString(), type: 'RECORD_NUMBER' };
  body['$revision'] = { value: row.revision.toString(), type: '__REVISION__' };
  return Response.json({ record: body });
};

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);

  const locale = detectLocale(request.headers.get("accept-language"));
  const fieldRows = findFields(db, body.app);
  const record = applyDefaults(fieldRows, body.record ?? {});
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
    return Response.json({ message: 'Record not found.' }, { status: 404 });
  }

  const mergedRecord = { ...JSON.parse(target.body), ...body.record };

  const locale = detectLocale(request.headers.get("accept-language"));
  const fieldRows = findFields(db, body.app);
  const errors = validateRecord(fieldRows, mergedRecord, {
    db,
    appId: body.app,
    excludeId: target.id,
    locale,
  });
  if (errors) return validationErrorResponse(errors, locale);

  const updated = updateRecord(db, body.app, String(target.id), mergedRecord);
  if (!updated) {
    return Response.json({ message: 'Record not found.' }, { status: 404 });
  }
  return Response.json({
    id: updated.id.toString(),
    revision: updated.revision.toString(),
  });
};
