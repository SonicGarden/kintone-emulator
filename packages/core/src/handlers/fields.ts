import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import { findFields } from "../db/fields";
import { applyFieldDefaults } from "../field-defaults";
import { errorInvalidInput, errorMessages, errorNotFoundApp } from "./errors";
import { enforceGuestSpace } from "./guest-space";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

export const get = ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const appParam = new URL(request.url).searchParams.get('app');
  if (!appParam) {
    return errorInvalidInput({ app: { messages: [errorMessages(locale).requiredField] } }, locale);
  }
  const appId = Number(appParam);

  const appResult = findApp(db, appId);
  if (!appResult) {
    return errorNotFoundApp(appId, locale);
  }
  const guestErr = enforceGuestSpace(db, appId, params.guestSpaceId, locale);
  if (guestErr) return guestErr;

  const rows = findFields(db, appId);
  const properties: Record<string, unknown> = {};
  for (const row of rows) {
    properties[row.code] = applyFieldDefaults(JSON.parse(row.body) as Record<string, unknown>);
  }

  return Response.json({ properties, revision: '1' });
};
