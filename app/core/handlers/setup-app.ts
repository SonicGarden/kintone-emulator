import { all, dbSession } from "../db";
import { insertFields } from "../fields";
import type { HandlerArgs } from "./types";

export const action = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);

  const result = await all<{ id: number; revision: number }>(
    db,
    "INSERT INTO apps (name, layout) VALUES (?, ?) RETURNING id, revision",
    body.name,
    body.layout ? JSON.stringify(body.layout) : '[]'
  );

  const appId = result[0].id;

  if (body.properties) {
    await insertFields(db, appId, body.properties);
  }

  return Response.json({
    app: appId.toString(),
    revision: result[0].revision.toString(),
  });
};
