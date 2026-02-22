import { ActionFunctionArgs } from "@remix-run/node";
import { all, dbSession, run } from "~/utils/db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  await run(db, "INSERT INTO apps (name) VALUES (?)", body.name);
  const result = await all<{ id: number; revision: number }>(
    db,
    "SELECT id, revision FROM apps WHERE rowid = last_insert_rowid()"
  );
  return Response.json({
    app: result[0].id.toString(),
    revision: result[0].revision.toString(),
  });
};
