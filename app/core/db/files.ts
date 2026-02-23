import type sqlite3 from "sqlite3";
import { all } from "./client";

export type FileRow = { data: ArrayBuffer; content_type: string; filename: string };

export const findFile = (db: sqlite3.Database, fileKey: string | null) =>
  all<FileRow>(db, `SELECT data, content_type, filename FROM files WHERE id = ?`, fileKey);

export const insertFile = (
  db: sqlite3.Database,
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
  );
