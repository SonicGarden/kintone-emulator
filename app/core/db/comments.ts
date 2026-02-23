import type sqlite3 from "sqlite3";
import { all } from "./client";

export type CommentRow = { id: number; message: string; mentions: string };

export const findRecordExists = (db: sqlite3.Database, appId: string | number, recordId: string | number) =>
  all<{ id: number }>(db, `SELECT id FROM records WHERE app_id = ? AND id = ?`, appId, recordId)
    .then(rows => rows[0]);

export const insertComment = (
  db: sqlite3.Database,
  appId: string | number,
  recordId: string | number,
  message: string,
  mentions: unknown[]
) =>
  all<{ id: number }>(
    db,
    "INSERT INTO comments (app_id, record_id, message, mentions) VALUES (?, ?, ?, ?) RETURNING id",
    appId,
    recordId,
    message,
    JSON.stringify(mentions)
  ).then(rows => rows[0]);

export const deleteComment = (
  db: sqlite3.Database,
  appId: string | number,
  recordId: string | number,
  commentId: string | number
) =>
  all<{ id: number }>(
    db,
    "DELETE FROM comments WHERE app_id = ? AND record_id = ? AND id = ? RETURNING id",
    appId,
    recordId,
    commentId
  ).then(rows => rows[0]);
