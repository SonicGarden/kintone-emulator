import sqlite3 from "sqlite3";
import { serialize } from "~/utils/db.server";

const INSERT_FIELD_SQL = `
INSERT INTO fields (app_id, code, body) VALUES (?, ?, ?)
`;

type Properties = {
  [key: string]: Record<string, unknown> & { type: string };
};

export const insertFields = (
  db: sqlite3.Database,
  appId: number | string,
  properties: Properties
) =>
  serialize(db, () => {
    for (const key in properties) {
      const body = { ...properties[key], code: key };
      db.run(INSERT_FIELD_SQL, appId, key, JSON.stringify(body));
    }
  });
