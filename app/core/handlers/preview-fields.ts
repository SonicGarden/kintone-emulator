import { dbSession, serialize } from "../db";
import { insertFields } from "../fields";
import type { HandlerArgs } from "./types";

type DeleteFieldsBody = { app: string | number; fields: string[] };

export const post = async ({
  request,
  params,
}: HandlerArgs) => {
  const db = dbSession(params.session);
  const requestData = await request.json();
  await insertFields(db, requestData.app, requestData.properties);
  return Response.json({ revision: "1" });
}

export const del = async ({
  request,
  params,
}: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const hasQuery = url.search.length > 0;
  const json: DeleteFieldsBody = hasQuery
    ? { app: '', fields: [] }
    : await request.json() as DeleteFieldsBody;
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('fields')) {
      json.fields.push(value);
    } else if (key === 'app') {
      json.app = value;
    }
  }
  await serialize(db, () => {
    for (const code of json.fields) {
      db.run('DELETE FROM fields WHERE app_id = ? AND code = ?', json.app, code);
    }
  });
  return Response.json({ revision: "1" });
}
