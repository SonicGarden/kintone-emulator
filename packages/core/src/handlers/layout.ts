import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import { errorNotFoundApp } from "./errors";
import { enforceGuestSpace } from "./guest-space";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

export const get = ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));
  const appId = Number(new URL(request.url).searchParams.get('app'));
  const db = dbSession(params.session);
  const row = findApp(db, appId);

  if (!row) {
    return errorNotFoundApp(appId, locale);
  }
  const guestErr = enforceGuestSpace(db, appId, params.guestSpaceId, locale);
  if (guestErr) return guestErr;

  return Response.json({
    layout: JSON.parse(row.layout),
    revision: row.revision.toString(),
  });
};
