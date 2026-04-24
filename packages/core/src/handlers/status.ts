// GET /k/v1/app/status.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/settings/get-process-management-settings/

import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import { errorInvalidInput, errorMessages, errorNotFoundApp } from "./errors";
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

  const row = findApp(dbSession(params.session), appId);
  if (!row) {
    return errorNotFoundApp(appId, locale);
  }

  const { enable, states, actions, revision } = JSON.parse(row.status);
  return Response.json({ enable, states, actions, revision });
};
