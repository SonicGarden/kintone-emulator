import { dbSession } from "../db/client";
import { findRecord, insertRecord, updateRecord } from "../db/records";
import { findFieldTypes } from "../db/fields";
import type { KintoneRecordField } from '@kintone/rest-api-client';
import type { HandlerArgs } from "./types";

type Record = {
  [fieldCode: string]: KintoneRecordField.OneOf;
}

export const get = async ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const app = url.searchParams.get('app');

  const rows = await findRecord(db, app, url.searchParams.get('id'));
  if (rows.length === 0) {
    return Response.json({ message: 'Record not found.' }, { status: 404 });
  }

  const body: Record = JSON.parse(rows[0].body);
  const fieldTypes = await findFieldTypes(db, app!);
  for (const field of fieldTypes) {
    if (body[field.code]) {
      body[field.code].type = field.type;
    }
  }
  body['$id'] = { value: rows[0].id.toString(), type: 'RECORD_NUMBER' };
  body['$revision'] = { value: rows[0].revision.toString(), type: '__REVISION__' };
  return Response.json({ record: body });
};

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  const result = await insertRecord(db, body.app, body.record);
  if (result.length === 0) {
    return Response.json({ message: 'Failed to create record.' }, { status: 500 });
  }
  return Response.json({
    id: result[0].id.toString(),
    revision: result[0].revision.toString(),
  });
};

export const put = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  const result = await updateRecord(db, body.id, body.record);
  if (result.length === 0) {
    return Response.json({ message: 'Record not found.' }, { status: 404 });
  }
  return Response.json({
    id: result[0].id.toString(),
    revision: result[0].revision.toString(),
  });
};
