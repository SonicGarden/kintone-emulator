import type sqlite3 from "sqlite3";
import { all } from "./client";

export type RecordRow = { id: number; body: string; revision: number };

export const findRecord = (db: sqlite3.Database, appId: string | null, id: string | null) =>
  all<RecordRow>(db, `SELECT id, revision, body FROM records WHERE app_id = ? AND id = ?`, appId, id);

export const findRecords = (db: sqlite3.Database, appId: string | null) =>
  all<RecordRow>(db, `SELECT id, revision, body FROM records WHERE app_id = ?`, appId);

export const findRecordsByClause = (
  db: sqlite3.Database,
  appId: string | null,
  clause: string,
  hasWhere: boolean
) =>
  all<RecordRow>(
    db,
    `SELECT id, revision, body FROM records WHERE app_id = ? ${hasWhere ? 'AND' : ''} ${clause}`,
    appId
  );

export const insertRecord = (db: sqlite3.Database, appId: string, record: unknown) =>
  all<{ id: number; revision: number }>(
    db,
    "INSERT INTO records (app_id, revision, body) VALUES (?, 1, ?) RETURNING id, revision",
    appId,
    JSON.stringify(record)
  );

export const updateRecord = (db: sqlite3.Database, id: string, record: unknown) =>
  all<{ id: number; revision: number }>(
    db,
    "UPDATE records SET body = ?, revision = revision + 1 WHERE id = ? RETURNING id, revision",
    JSON.stringify(record),
    id
  );

export const findRecordByKey = (
  db: sqlite3.Database,
  appId: string | number,
  fieldCode: string,
  fieldValue: string
) =>
  all<RecordRow>(
    db,
    `SELECT id, revision, body FROM records WHERE app_id = ? AND body->>'$.${fieldCode}.value' = ?`,
    appId,
    fieldValue
  );
