import { ActionFunctionArgs } from "@remix-run/node";
import { all, dbSession } from "~/utils/db.server";

export async function loader({
  request,
  params,
}: ActionFunctionArgs) {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const result = await all<{ code: string; body: string }>(
    db,
    `SELECT code, body FROM fields WHERE app_id = ?`,
    Number(url.searchParams.get('app'))
  );

  const properties: Record<string, unknown> = {};
  for (const row of result) {
    properties[row.code] = { noLabel: false, ...JSON.parse(row.body) };
  }

  return Response.json({ properties, revision: '1' });
}
