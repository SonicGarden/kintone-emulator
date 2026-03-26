import type Database from "better-sqlite3";
import { all } from "./client";

export type CommentRow = { id: number; message: string; mentions: string; createdAt: string };

export const findRecordExists = (db: Database.Database, appId: string | number, recordId: string | number) =>
  all<{ id: number }>(db, `SELECT id FROM records WHERE app_id = ? AND id = ?`, appId, recordId)[0];

export const findComments = (
  db: Database.Database,
  appId: string | number,
  recordId: string | number,
  order: "asc" | "desc",
  offset: number,
  limit: number
) =>
  all<CommentRow>(
    db,
    `SELECT id, message, mentions, created_at as createdAt FROM comments WHERE app_id = ? AND record_id = ? ORDER BY id ${order} LIMIT ? OFFSET ?`,
    appId,
    recordId,
    limit,
    offset
  );

export const countComments = (
  db: Database.Database,
  appId: string | number,
  recordId: string | number
) =>
  all<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM comments WHERE app_id = ? AND record_id = ?",
    appId,
    recordId
  )[0]?.count ?? 0;

export const insertComment = (
  db: Database.Database,
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
  )[0];

export const deleteComment = (
  db: Database.Database,
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
  )[0];
