import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import { findFields } from "../db/fields";
import { errorNotFoundApp } from "./errors";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

export const get = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const appId = Number(new URL(request.url).searchParams.get('app'));

  const appResult = findApp(db, appId);
  if (!appResult) {
    return errorNotFoundApp(appId, locale);
  }

  const rows = findFields(db, appId);
  const properties: Record<string, unknown> = {};
  for (const row of rows) {
    properties[row.code] = { noLabel: false, ...JSON.parse(row.body) };
  }

  return Response.json({ properties, revision: '1' });
};
