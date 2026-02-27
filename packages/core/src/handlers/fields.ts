import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import { findFields } from "../db/fields";
import type { HandlerArgs } from "./types";

export const get = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const appId = Number(new URL(request.url).searchParams.get('app'));

  const appResult = findApp(db, appId);
  if (!appResult) {
    return Response.json({ message: 'App not found.' }, { status: 404 });
  }

  const rows = findFields(db, appId);
  const properties: Record<string, unknown> = {};
  for (const row of rows) {
    properties[row.code] = { noLabel: false, ...JSON.parse(row.body) };
  }

  return Response.json({ properties, revision: '1' });
};
