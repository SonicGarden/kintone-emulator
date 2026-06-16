// GET /k/v1/app.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/get-app/

import { findApp } from "../db/apps";
import type { AppRow } from "../db/apps";
import { dbSession } from "../db/client";
import { errorInvalidInput, errorMessages, errorNotFoundApp } from "./errors";
import { enforceGuestSpace } from "./guest-space";
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

  const guestErr = enforceGuestSpace(db, row.id, params.guestSpaceId, locale);
  if (guestErr) return guestErr;

  return Response.json(toAppResponse(row));
};
