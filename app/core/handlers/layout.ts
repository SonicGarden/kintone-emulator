import { all, dbSession } from "../db";
import type { HandlerArgs } from "./types";

export const get = async ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const appId = Number(url.searchParams.get('app'));

  const appResult = await all<{ layout: string; revision: number }>(
    db,
    `SELECT layout, revision FROM apps WHERE id = ?`,
    appId
  );

  if (appResult.length === 0) {
    return Response.json({ message: 'App not found.' }, { status: 404 });
  }

  return Response.json({
    layout: JSON.parse(appResult[0].layout),
    revision: appResult[0].revision.toString(),
  });
}
