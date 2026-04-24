import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import { errorNotFoundApp } from "./errors";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

export const get = ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));
  const appId = Number(new URL(request.url).searchParams.get('app'));
  const row = findApp(dbSession(params.session), appId);

  if (!row) {
    return errorNotFoundApp(appId, locale);
  }

  return Response.json({
    layout: JSON.parse(row.layout),
    revision: row.revision.toString(),
  });
};
