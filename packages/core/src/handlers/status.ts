// GET /k/v1/app/status.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/settings/get-process-management-settings/

import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import type { HandlerArgs } from "./types";

export const get = async ({ request, params }: HandlerArgs) => {
  const url = new URL(request.url);
  const appParam = url.searchParams.get('app');
  if (!appParam) {
    return Response.json({ message: 'app is required.' }, { status: 400 });
  }

  const appId = Number(appParam);
  if (!Number.isInteger(appId) || appId <= 0) {
    return Response.json({ message: 'app must be a positive integer.' }, { status: 400 });
  }

  const row = await findApp(dbSession(params.session), appId);
  if (!row) {
    return Response.json({ message: 'App not found.' }, { status: 404 });
  }

  const { enable, states, actions, revision } = JSON.parse(row.status);
  return Response.json({ enable, states, actions, revision });
};
