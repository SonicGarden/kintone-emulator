import { ActionFunctionArgs } from "@remix-run/node";
import { dbSession, serialize } from "~/utils/db.server";
import dedent from "dedent";

const CREATE_TABLE_FIELDS = dedent`
  CREATE TABLE IF NOT EXISTS fields (
    id INTEGER PRIMARY KEY,
    app_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT,
    code TEXT unique,
    label TEXT
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
export async function action({ params }: ActionFunctionArgs) {
  const db = dbSession(params.session);
  await serialize(db, () => {
    db.run(CREATE_TABLE_FIELDS);
    db.run(CREATE_TABLE_RECORDS);
    db.run(CREATE_TABLE_FILES);
    db.run(CREATE_TABLE_APPS);
  });

  return Response.json({ result: 'ok' });
}
