import type Database from "better-sqlite3";
import { all, run } from "./client";

export type WebhookEvent =
  | "ADD_RECORD"
  | "UPDATE_RECORD"
  | "DELETE_RECORD"
  | "ADD_RECORD_COMMENT"
  | "UPDATE_STATUS";

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  "ADD_RECORD",
  "UPDATE_RECORD",
  "DELETE_RECORD",
  "ADD_RECORD_COMMENT",
  "UPDATE_STATUS",
];

export type WebhookRow = {
  id: number;
  app_id: number;
  url: string;
  events: string; // ["ADD_RECORD", ...] の JSON 文字列
};

const WEBHOOK_COLUMNS = `id, app_id, url, events`;

export const insertWebhook = (
  db: Database.Database,
  appId: number | string,
  url: string,
  events: WebhookEvent[]
) =>
  run(
    db,
    `INSERT INTO webhooks (app_id, url, events) VALUES (?, ?, ?)`,
    appId,
    url,
    JSON.stringify(events)
  );

export const findWebhooksByApp = (db: Database.Database, appId: number | string) =>
  all<WebhookRow>(db, `SELECT ${WEBHOOK_COLUMNS} FROM webhooks WHERE app_id = ?`, appId);

export const deleteWebhooksByApp = (db: Database.Database, appId: number | string) =>
  run(db, `DELETE FROM webhooks WHERE app_id = ?`, appId);
