import type Database from "better-sqlite3";
import { all, run } from "./client";

export type RecordRow = { id: number; body: string; revision: number };

export const findRecord = (db: Database.Database, appId: string | null, id: string | null) =>
  all<RecordRow>(db, `SELECT id, revision, body FROM records WHERE app_id = ? AND id = ?`, appId, id)[0];

export const findRecords = (db: Database.Database, appId: string | null) =>
  all<RecordRow>(db, `SELECT id, revision, body FROM records WHERE app_id = ?`, appId);

export const findRecordsByClause = (
  db: Database.Database,
  appId: string | null,
  clause: string,
  hasWhere: boolean
) =>
  all<RecordRow>(
    db,
    `SELECT id, revision, body FROM records WHERE app_id = ? ${hasWhere ? 'AND' : ''} ${clause}`,
    appId
  );

// kintone の実仕様に合わせ、レコード ID は削除後も再利用しない。
// apps.record_id_seq をシーケンスとして使い、単調増加する ID を採番する。
export const insertRecord = (db: Database.Database, appId: string, record: unknown, id?: number) => {
  if (id != null) {
    // ID 指定時（setup 経由）: INSERT 後にシーケンスを追従させる
    const result = all<{ id: number; revision: number }>(
      db,
      "INSERT INTO records (app_id, id, revision, body) VALUES (?, ?, 1, ?) RETURNING id, revision",
      appId, id, JSON.stringify(record)
    )[0];
    run(
      db,
      "UPDATE apps SET record_id_seq = MAX(record_id_seq, ?) WHERE id = ?",
      id, appId
    );
    return result;
  }
  // setup/app.json を経由せず直接レコードが作られる場合に備え、apps 行がなければ作成する
  run(db, "INSERT OR IGNORE INTO apps (id, name, record_id_seq) VALUES (?, '', 0)", appId);
  const { record_id_seq } = all<{ record_id_seq: number }>(
    db,
    "UPDATE apps SET record_id_seq = record_id_seq + 1 WHERE id = ? RETURNING record_id_seq",
    appId
  )[0]!;
  return all<{ id: number; revision: number }>(
    db,
    "INSERT INTO records (app_id, id, revision, body) VALUES (?, ?, 1, ?) RETURNING id, revision",
    appId, record_id_seq, JSON.stringify(record)
  )[0];
};

export const updateRecord = (db: Database.Database, appId: string, id: string, record: unknown) =>
  all<{ id: number; revision: number }>(
    db,
    "UPDATE records SET body = ?, revision = revision + 1 WHERE app_id = ? AND id = ? RETURNING id, revision",
    JSON.stringify(record),
    appId,
    id
  )[0];

export const deleteRecords = (
  db: Database.Database,
  appId: string | null,
  ids: (string | number)[]
) => {
  const placeholders = ids.map(() => '?').join(', ');
  return all<{ id: number }>(
    db,
    `DELETE FROM records WHERE app_id = ? AND id IN (${placeholders}) RETURNING id`,
    appId,
    ...ids
  );
};

export const findRecordByKey = (
  db: Database.Database,
  appId: string | number,
  fieldCode: string,
  fieldValue: string
) =>
  all<RecordRow>(
    db,
    `SELECT id, revision, body FROM records WHERE app_id = ? AND body->>'$.${fieldCode}.value' = ?`,
    appId,
    fieldValue
  )[0];
