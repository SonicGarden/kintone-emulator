import { dbSession } from "../db/client";
import { insertApp } from "../db/apps";
import { insertFields } from "../db/fields";
import type { FieldProperties } from "../db/fields";
import type { HandlerArgs } from "./types";

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);

  const result = await insertApp(db, body.name, body.layout ? JSON.stringify(body.layout) : '[]');
  if (result.length === 0) {
    return Response.json({ message: 'Failed to create app.' }, { status: 500 });
  }

  const appId = result[0].id;
  if (body.properties) {
    await insertFields(db, appId, body.properties as FieldProperties);
  }

  return Response.json({
    app: appId.toString(),
    revision: result[0].revision.toString(),
  });
};
