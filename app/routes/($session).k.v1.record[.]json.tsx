import { ActionFunctionArgs } from "@remix-run/node";
import { all, dbSession, run } from "~/utils/db.server";
import type { KintoneRecordField } from '@kintone/rest-api-client';

type Record = {
  [fieldCode: string]: KintoneRecordField.OneOf;
}

export const loader = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const app = url.searchParams.get('app');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordResult = await all<{ body: any, id: number, revision: number }>(db, `SELECT id, revision, body FROM records WHERE app_id = ? and id = ?`, app, url.searchParams.get('id'));
  const body: Record = JSON.parse(recordResult[0].body);
  const id = recordResult[0].id;
  const revision = recordResult[0].revision;
  const fieldsResult = await all<{ code: string, type: KintoneRecordField.OneOf['type'] }>(db, `SELECT code, body->>'$.type' as type FROM fields WHERE app_id = ?`, app);
  for (const field of fieldsResult) {
    if (body[field.code]) {
      body[field.code].type = field.type;
    }
  }
  body['$id'] = { value: id.toString(), type: 'RECORD_NUMBER' };
  body['$revision'] = { value: revision.toString(), type: '__REVISION__' };
  return Response.json({ record: body });
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  switch (request.method) {
    case 'POST': {
      await run(db, "INSERT INTO records (app_id, revision, body) VALUES (?, 1, ?)", body.app, JSON.stringify(body.record));
      break;
    }
    case 'PUT': {
      await run(db, "UPDATE records SET body = ?, revision = revision + 1 WHERE id = ?", JSON.stringify(body.record), body.id);
      break;
    }
  }
  const recordResult = await all<{ id: number, revision: number }>(db, `SELECT id,revision FROM records WHERE rowid = last_insert_rowid()`);
  return Response.json({
    id: recordResult[0].id.toString(),
    revision: recordResult[0].revision.toString(),
  });
}
