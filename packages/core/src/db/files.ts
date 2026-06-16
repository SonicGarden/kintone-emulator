import type Database from "better-sqlite3";
import { all } from "./client";

export type FileRow = { data: Buffer; content_type: string; filename: string };

// ダウンロード用。実 kintone 同様、ダウンロードキー（レコード取得APIで得たキー）のみ受け付ける。
// アップロード時の一時キー（upload_key）ではダウンロードできない。
export const findFile = (db: Database.Database, fileKey: string | null) =>
  all<FileRow>(
    db,
    `SELECT data, content_type, filename FROM files WHERE download_key = ?`,
    fileKey
  )[0];

export type FileMeta = { content_type: string; filename: string; size: number };

// レコード取得時の FILE フィールド enrich 用。BLOB のバイト長を size として返す。
// レコード body にはダウンロードキーが保存されるため download_key で引く。
export const findFileMeta = (db: Database.Database, fileKey: string | null) =>
  all<FileMeta>(
    db,
    `SELECT content_type, filename, LENGTH(data) AS size FROM files WHERE download_key = ?`,
    fileKey
  )[0];

// アップロードキー → ダウンロードキー の振り替え用。
// レコード登録/更新時に upload_key を download_key へ変換するために使う。
export const findDownloadKeyByUploadKey = (db: Database.Database, uploadKey: string | null) =>
  all<{ download_key: string }>(
    db,
    `SELECT download_key FROM files WHERE upload_key = ?`,
    uploadKey
  )[0]?.download_key;

export const insertFile = (
  db: Database.Database,
  filename: string,
  data: Buffer,
  contentType: string,
  uploadKey: string,
  downloadKey: string
) =>
  all<{ id: number }>(
    db,
    `INSERT INTO files (filename, data, content_type, upload_key, download_key) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    filename,
    data,
    contentType,
    uploadKey,
    downloadKey
  )[0];
