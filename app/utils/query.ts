import { Database } from "sqlite3";
import { all } from "./db.server";
import { KintoneRecordField } from "@kintone/rest-api-client";

export type FieldTypes = { [key: string]: KintoneRecordField.OneOf["type"] };

export const getFieldTypes = async (db: Database, app: string) => {
  const fieldsResult = await all<{
    code: string;
    type: KintoneRecordField.OneOf["type"];
  }>(db, `SELECT code, type FROM fields WHERE app_id = ?`, app);
  const fieldTypes: { [key: string]: KintoneRecordField.OneOf["type"] } = {};
  for (const field of fieldsResult) {
    fieldTypes[field.code] = field.type;
  }
  return fieldTypes;
};
