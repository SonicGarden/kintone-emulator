import { ActionFunctionArgs } from "@remix-run/node";
import { all, dbSession } from "~/utils/db.server";
import { insertFields } from "~/utils/fields.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
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
