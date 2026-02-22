import { ActionFunctionArgs } from "@remix-run/node";
import { all, dbSession } from "~/utils/db.server";
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
  let recordResult: { id: number, revision: number }[];
  switch (request.method) {
    case 'POST': {
      recordResult = await all<{ id: number, revision: number }>(db, "INSERT INTO records (app_id, revision, body) VALUES (?, 1, ?) RETURNING id, revision", body.app, JSON.stringify(body.record));
      break;
    }
    case 'PUT': {
      recordResult = await all<{ id: number, revision: number }>(db, "UPDATE records SET body = ?, revision = revision + 1 WHERE id = ? RETURNING id, revision", JSON.stringify(body.record), body.id);
      break;
    }
    default:
      return Response.json({ message: 'Method Not Allowed' }, { status: 405 });
  }
  if (recordResult.length === 0) {
    return Response.json({ message: 'Record not found.' }, { status: 404 });
  }
  return Response.json({
    id: recordResult[0].id.toString(),
    revision: recordResult[0].revision.toString(),
  });
}
