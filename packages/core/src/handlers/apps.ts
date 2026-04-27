// GET k/v1/apps.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/get-apps/

import { findApps } from "../db/apps";
import type { AppRow } from "../db/apps";
import { dbSession } from "../db/client";
import type { HandlerArgs } from "./types";

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
  const url = new URL(request.url);

  const ids: number[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('ids')) {
      ids.push(Number(value));
    }
  }

  const guestSpaceId = params.guestSpaceId != null ? Number(params.guestSpaceId) : undefined;

  const result = findApps(dbSession(params.session), {
    ids,
    name: url.searchParams.get('name') ?? undefined,
    spaceIds: guestSpaceId != null ? [guestSpaceId] : undefined,
    limit: Math.min(Number(url.searchParams.get('limit') ?? '100'), 100),
    offset: Number(url.searchParams.get('offset') ?? '0'),
  });

  return Response.json({ apps: result.map(toAppResponse) });
};
