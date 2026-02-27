// GET /k/v1/app.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/get-app/

import { findApp } from "../db/apps";
import type { AppRow } from "../db/apps";
import { dbSession } from "../db/client";
import type { HandlerArgs } from "./types";

const toAppResponse = (row: AppRow) => ({
  appId: row.id.toString(),
  code: "",
  name: row.name,
  description: "",
  spaceId: null,
  threadId: null,
  createdAt: row.created_at,
  creator: { code: "", name: "" },
  modifiedAt: row.updated_at,
  modifier: { code: "", name: "" },
});

export const get = async ({ request, params }: HandlerArgs) => {
  const url = new URL(request.url);
  const idParam = url.searchParams.get('id');
  if (!idParam) {
    return Response.json({ message: 'id is required.' }, { status: 400 });
  }

  const row = await findApp(dbSession(params.session), Number(idParam));
  if (!row) {
    return Response.json({ message: 'App not found.' }, { status: 404 });
  }

  return Response.json(toAppResponse(row));
};
