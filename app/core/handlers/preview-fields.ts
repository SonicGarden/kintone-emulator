import { dbSession } from "../db/client";
import { insertFields, deleteFields } from "../db/fields";
import type { FieldProperties } from "../db/fields";
import type { HandlerArgs } from "./types";

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  await insertFields(dbSession(params.session), body.app, body.properties as FieldProperties);
  return Response.json({ revision: "1" });
};

export const del = async ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  // クエリパラメーターがある場合はそちらから、ない場合はリクエストボディから読む
  const hasQueryParams = url.search.length > 0;
  const body = hasQueryParams
    ? { app: url.searchParams.get('app') ?? '', fields: [] as string[] }
    : await request.json() as { app: string; fields: string[] };

  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('fields')) {
      body.fields.push(value);
    }
  }

  await deleteFields(db, body.app, body.fields);
  return Response.json({ revision: "1" });
};
