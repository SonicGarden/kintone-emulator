// GET k/v1/apps.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/get-apps/

import { all, dbSession } from "../db";
import type { HandlerArgs } from "./types";

type AppRow = { id: number; name: string; created_at: string; updated_at: string };

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
  const db = dbSession(params.session);
  const url = new URL(request.url);

  const ids: number[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('ids')) {
      ids.push(Number(value));
    }
  }

  const name = url.searchParams.get('name');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 100);

  const conditions: string[] = [];
  const sqlParams: unknown[] = [];

  if (ids.length > 0) {
    conditions.push(`id IN (${ids.map(() => '?').join(', ')})`);
    sqlParams.push(...ids);
  }

  if (name) {
    conditions.push(`name LIKE ?`);
    sqlParams.push(`%${name}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  sqlParams.push(limit, offset);

  const result = await all<AppRow>(
    db,
    `SELECT id, name, created_at, updated_at FROM apps ${where} LIMIT ? OFFSET ?`,
    ...sqlParams
  );

  return Response.json({ apps: result.map(toAppResponse) });
};
