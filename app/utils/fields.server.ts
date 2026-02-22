import sqlite3 from "sqlite3";
import { serialize } from "~/utils/db.server";

const INSERT_FIELD_SQL = `
INSERT INTO fields (app_id, type, code, label) VALUES (?, ?, ?, ?)
`;

type Properties = {
  [key: string]: { type: string; label: string };
};

export const insertFields = (
  db: sqlite3.Database,
  appId: number | string,
  properties: Properties
) =>
  serialize(db, () => {
    for (const key in properties) {
      db.run(INSERT_FIELD_SQL, appId, properties[key].type, key, properties[key].label);
    }
  });
