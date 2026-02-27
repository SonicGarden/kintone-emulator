import type { KintoneRecordField } from "@kintone/rest-api-client";
import type Database from "better-sqlite3";
import { all, run } from "./client";

export type FieldRow = { code: string; body: string };
export type FieldTypeRow = { code: string; type: KintoneRecordField.OneOf["type"] };

export type FieldProperties = {
  [key: string]: Record<string, unknown> & { type: string };
};

export const findFields = (db: Database.Database, appId: number | string) =>
  all<FieldRow>(db, `SELECT code, body FROM fields WHERE app_id = ?`, appId);

export const findFieldTypes = (db: Database.Database, appId: number | string) =>
  all<FieldTypeRow>(db, `SELECT code, body->>'$.type' as type FROM fields WHERE app_id = ?`, appId);

export const insertFields = (
  db: Database.Database,
  appId: number | string,
  properties: FieldProperties
) => {
  for (const key in properties) {
    const body = { ...properties[key], code: key };
    run(db, 'INSERT INTO fields (app_id, code, body) VALUES (?, ?, ?)', appId, key, JSON.stringify(body));
  }
};

export const deleteFields = (db: Database.Database, appId: string | number, codes: string[]) => {
  for (const code of codes) {
    run(db, 'DELETE FROM fields WHERE app_id = ? AND code = ?', appId, code);
  }
};
