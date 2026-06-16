// レコードを REST API（record.json GET）と同じ形に整形する共有ロジック。
// Webhook の record ペイロードは getRecord レスポンスと完全一致させる必要があるため、
// record.ts の get と Webhook フックの両方からこの関数を使う。

import type Database from "better-sqlite3";
import { findFields } from "../db/fields";
import { findRecord } from "../db/records";
import { enrichFileFields } from "./file-enrich";
import { getStatusConfig, withStatusFieldRow } from "./process-status";
import { attachFieldTypes } from "./validate";

export type FormattedRecord = Record<string, { type?: string; value?: unknown }>;

/** DB から最新レコードを取得し、フィールド型・$id・$revision を付与した getRecord 形式で返す。存在しなければ undefined。 */
export const buildFormattedRecord = (
  db: Database.Database,
  appId: string | number,
  id: string | number,
): FormattedRecord | undefined => {
  const row = findRecord(db, String(appId), String(id));
  if (!row) return undefined;

  const body = JSON.parse(row.body) as FormattedRecord;
  const statusConfig = getStatusConfig(db, appId);
  const fieldRows = withStatusFieldRow(findFields(db, appId), statusConfig);
  attachFieldTypes(body, fieldRows, {
    recordId: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  enrichFileFields(db, body, fieldRows);
  body["$id"] = { value: row.id.toString(), type: "__ID__" };
  body["$revision"] = { value: row.revision.toString(), type: "__REVISION__" };
  return body;
};
