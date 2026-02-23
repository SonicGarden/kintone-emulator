import type sqlite3 from "sqlite3";
import type { KintoneRecordField } from "@kintone/rest-api-client";
import { all, serialize } from "./client";

export type FieldRow = { code: string; body: string };
export type FieldTypeRow = { code: string; type: KintoneRecordField.OneOf["type"] };

export type FieldProperties = {
  [key: string]: Record<string, unknown> & { type: string };
};

export const findFields = (db: sqlite3.Database, appId: number | string) =>
  all<FieldRow>(db, `SELECT code, body FROM fields WHERE app_id = ?`, appId);

export const findFieldTypes = (db: sqlite3.Database, appId: number | string) =>
  all<FieldTypeRow>(db, `SELECT code, body->>'$.type' as type FROM fields WHERE app_id = ?`, appId);

export const insertFields = (
  db: sqlite3.Database,
  appId: number | string,
  properties: FieldProperties
) =>
  serialize(db, () => {
    for (const key in properties) {
      const body = { ...properties[key], code: key };
      db.run('INSERT INTO fields (app_id, code, body) VALUES (?, ?, ?)', appId, key, JSON.stringify(body));
    }
  });

export const deleteFields = (db: sqlite3.Database, appId: string | number, codes: string[]) =>
  serialize(db, () => {
    for (const code of codes) {
      db.run('DELETE FROM fields WHERE app_id = ? AND code = ?', appId, code);
    }
  });
