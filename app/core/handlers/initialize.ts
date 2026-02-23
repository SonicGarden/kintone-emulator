import { dbSession, serialize } from "../db";
import dedent from "dedent";
import type { HandlerArgs } from "./types";

const CREATE_TABLE_FIELDS = dedent`
  CREATE TABLE IF NOT EXISTS fields (
    id INTEGER PRIMARY KEY,
    app_id INTEGER,
    code TEXT UNIQUE,
    body JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

const CREATE_TABLE_RECORDS = dedent`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY,
    revision INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    app_id INTEGER,
    body JSON
  )
`;

const CREATE_TABLE_FILES = dedent`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    filename TEXT,
    content_type TEXT,
    data BLOB
  )
`;

const CREATE_TABLE_APPS = dedent`
  CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    revision INTEGER DEFAULT 1,
    layout JSON DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const post = async ({ params }: HandlerArgs) => {
  const db = dbSession(params.session);
  await serialize(db, () => {
    db.run(CREATE_TABLE_FIELDS);
    db.run(CREATE_TABLE_RECORDS);
    db.run(CREATE_TABLE_FILES);
    db.run(CREATE_TABLE_APPS);
  });

  return Response.json({ result: 'ok' });
}
