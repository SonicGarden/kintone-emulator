import dedent from "dedent";
import type sqlite3 from "sqlite3";
import { serialize } from "./client";

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

const CREATE_TABLE_COMMENTS = dedent`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    app_id INTEGER,
    record_id INTEGER,
    message TEXT,
    mentions JSON
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

export const createTables = async (db: sqlite3.Database) => {
  await serialize(db, () => {
    db.run(CREATE_TABLE_FIELDS);
    db.run(CREATE_TABLE_RECORDS);
    db.run(CREATE_TABLE_FILES);
    db.run(CREATE_TABLE_APPS);
    db.run(CREATE_TABLE_COMMENTS);
  });
};

export const dropTables = async (db: sqlite3.Database) => {
  await serialize(db, () => {
    db.run("DROP TABLE IF EXISTS fields");
    db.run("DROP TABLE IF EXISTS records");
    db.run("DROP TABLE IF EXISTS files");
    db.run("DROP TABLE IF EXISTS apps");
    db.run("DROP TABLE IF EXISTS comments");
  });
};
