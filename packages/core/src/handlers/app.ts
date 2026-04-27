// GET /k/v1/app.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/get-app/

import { findApp } from "../db/apps";
import type { AppRow } from "../db/apps";
import { dbSession } from "../db/client";
import { findSpace } from "../db/spaces";
import { errorGuestSpacePathRequired, errorInvalidInput, errorMessages, errorNotFoundApp } from "./errors";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

const toAppResponse = (row: AppRow) => ({
  appId: row.id.toString(),
  code: "",
  name: row.name,
  description: "",
  spaceId: row.space_id != null ? row.space_id.toString() : null,
  threadId: row.thread_id != null ? row.thread_id.toString() : null,
  createdAt: row.created_at,
  creator: { code: "", name: "" },
  modifiedAt: row.updated_at,
  modifier: { code: "", name: "" },
});

export const get = ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));
  const url = new URL(request.url);
  const idParam = url.searchParams.get('id');
  if (!idParam) {
    return errorInvalidInput({ id: { messages: [errorMessages(locale).requiredField] } }, locale);
  }

  const db = dbSession(params.session);
  const row = findApp(db, Number(idParam));
  if (!row) {
    return errorNotFoundApp(idParam, locale);
  }

  const requestedGuest = params.guestSpaceId != null ? Number(params.guestSpaceId) : null;
  const appSpace = row.space_id != null ? findSpace(db, row.space_id) : undefined;
  const appIsInGuestSpace = !!appSpace && appSpace.is_guest === 1;

  if (requestedGuest == null) {
    // 非ゲストパス × ゲストスペース内アプリ → GAIA_IL23
    if (appIsInGuestSpace) {
      return errorGuestSpacePathRequired(locale);
    }
  } else {
    // ゲストパス × 通常スペースのアプリ or 別の guest space のアプリ → 404
    if (!appIsInGuestSpace || row.space_id !== requestedGuest) {
      return errorNotFoundApp(idParam, locale);
    }
  }

  return Response.json(toAppResponse(row));
};
