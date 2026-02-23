import { all, dbSession } from "../db";
import type { HandlerArgs } from "./types";

export async function loader({
  request,
  params,
}: HandlerArgs) {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const appId = Number(url.searchParams.get('app'));

  const appResult = await all<{ id: number }>(db, `SELECT id FROM apps WHERE id = ?`, appId);
  if (appResult.length === 0) {
    return Response.json({ message: 'App not found.' }, { status: 404 });
  }

  const result = await all<{ code: string; body: string }>(
    db,
    `SELECT code, body FROM fields WHERE app_id = ?`,
    appId
  );

  const properties: Record<string, unknown> = {};
  for (const row of result) {
    properties[row.code] = { noLabel: false, ...JSON.parse(row.body) };
  }

  return Response.json({ properties, revision: '1' });
}
