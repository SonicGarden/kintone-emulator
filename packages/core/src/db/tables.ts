import type Database from "better-sqlite3";
import dedent from "dedent";

const CREATE_TABLE_FIELDS = dedent`
  CREATE TABLE IF NOT EXISTS fields (
    id INTEGER PRIMARY KEY,
    app_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    body JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(app_id, code)
  )
`;

const CREATE_TABLE_RECORDS = dedent`
  CREATE TABLE IF NOT EXISTS records (
    app_id INTEGER NOT NULL,
    id INTEGER NOT NULL,
    revision INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    body JSON,
    PRIMARY KEY (app_id, id)
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

// status の revision の初期値が 3 なのは、Kintone でアプリを作成した直後に 3 だったのを再現しているため
const CREATE_TABLE_APPS = dedent`
  CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    revision INTEGER DEFAULT 1,
    record_id_seq INTEGER DEFAULT 0,
    layout JSON DEFAULT '[]',
    status JSON DEFAULT '{"enable":false,"states":null,"actions":null,"revision":"3"}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

export const createTables = (db: Database.Database) => {
  db.exec(CREATE_TABLE_FIELDS);
  db.exec(CREATE_TABLE_RECORDS);
  db.exec(CREATE_TABLE_FILES);
  db.exec(CREATE_TABLE_APPS);
  db.exec(CREATE_TABLE_COMMENTS);
};

export const dropTables = (db: Database.Database) => {
  db.exec("DROP TABLE IF EXISTS fields");
  db.exec("DROP TABLE IF EXISTS records");
  db.exec("DROP TABLE IF EXISTS files");
  db.exec("DROP TABLE IF EXISTS apps");
  db.exec("DROP TABLE IF EXISTS comments");
};
