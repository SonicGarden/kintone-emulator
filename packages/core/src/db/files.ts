import type Database from "better-sqlite3";
import { all } from "./client";

export type FileRow = { data: Buffer; content_type: string; filename: string };

export const findFile = (db: Database.Database, fileKey: string | null) =>
  all<FileRow>(db, `SELECT data, content_type, filename FROM files WHERE id = ?`, fileKey)[0];

export const insertFile = (
  db: Database.Database,
  filename: string,
  data: Buffer,
  contentType: string
) =>
  all<{ id: number }>(
    db,
    `INSERT INTO files (filename, data, content_type) VALUES (?, ?, ?) RETURNING id`,
    filename,
    data,
    contentType
  )[0];
