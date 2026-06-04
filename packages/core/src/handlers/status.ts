// GET /k/v1/app/status.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/settings/get-process-management-settings/

import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import { errorInvalidInput, errorMessages, errorNotFoundApp } from "./errors";
import { enforceGuestSpace } from "./guest-space";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

export const get = ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);
  const url = new URL(request.url);
  const appParam = url.searchParams.get('app');
  if (!appParam) {
    return errorInvalidInput({ app: { messages: [m.requiredField] } }, locale);
  }

  const appId = Number(appParam);
  if (!Number.isInteger(appId) || appId <= 0) {
    return errorInvalidInput({ app: { messages: [m.mustBeAtLeastOne] } }, locale);
  }

  const db = dbSession(params.session);
  const row = findApp(db, appId);
  if (!row) {
    return errorNotFoundApp(appId, locale);
  }
  const guestErr = enforceGuestSpace(db, appId, params.guestSpaceId, locale);
  if (guestErr) return guestErr;

  const { enable, states, actions, revision } = JSON.parse(row.status);
  // 実機の getProcessManagement レスポンスでは各 action に type: "PRIMARY" が付く。
  // 入力側では送らないため、レスポンス時に補完する。
  const actionsWithType = Array.isArray(actions)
    ? actions.map((a) => ({ ...a, type: a.type ?? "PRIMARY" }))
    : actions;
  return Response.json({ enable, states, actions: actionsWithType, revision });
};
