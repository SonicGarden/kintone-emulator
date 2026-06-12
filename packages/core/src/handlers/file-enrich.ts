// FILE フィールドの value をレコード保存時・取得時に実 kintone 形式へ変換する。
//
// 保存時（resolveUploadKeys）:
//   レコード登録/更新で送られる FILE の value は `[{ fileKey: <アップロードキー> }]`。
//   実 kintone はレコードに添付すると一時保管領域のキー（upload_key）を
//   ダウンロード用キー（download_key）へ振り替える。これを再現し、body には
//   download_key を保存する。既に download_key の場合（既存レコードの再保存）はそのまま。
//
// 取得時（enrichFileFields）:
//   保存された `[{ fileKey: <download_key> }]` を、files テーブルのメタ情報で
//   `[{ contentType, fileKey, name, size }]` に補完する。
//
// いずれも top-level / SUBTABLE 内の FILE フィールドに対応する。

import type Database from "better-sqlite3";
import type { FieldRow } from "../db/fields";
import { findDownloadKeyByUploadKey, findFileMeta } from "../db/files";

type Cell = { type?: string; value?: unknown };
type RecordBody = Record<string, Cell>;
type SubtableRow = { id?: string; value?: RecordBody };
type FileItem = { fileKey?: unknown; [key: string]: unknown };

// body 内の各 FILE セル（top-level / SUBTABLE 内）に対して transform を適用する。
const forEachFileCell = (
  body: RecordBody,
  fieldRows: FieldRow[],
  transform: (cell: Cell) => void,
): void => {
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as { type: string; fields?: Record<string, { type: string }> };

    if (def.type === "FILE") {
      const cell = body[row.code];
      if (cell) transform(cell);
      continue;
    }

    if (def.type === "SUBTABLE" && def.fields) {
      const fileCodes = Object.entries(def.fields)
        .filter(([, f]) => f.type === "FILE")
        .map(([code]) => code);
      if (fileCodes.length === 0) continue;
      const rows = body[row.code]?.value;
      if (!Array.isArray(rows)) continue;
      for (const r of rows as SubtableRow[]) {
        if (!r.value) continue;
        for (const code of fileCodes) {
          const cell = r.value[code];
          if (cell) transform(cell);
        }
      }
    }
  }
};

// FILE value の 1 要素を enrich。fileKey が files に無い / value 形式が不正なら元のまま返す。
const enrichFileItem = (db: Database.Database, item: unknown): unknown => {
  if (item == null || typeof item !== "object") return item;
  const fileKey = (item as FileItem).fileKey;
  if (fileKey == null) return item;
  const meta = findFileMeta(db, String(fileKey));
  if (!meta) return item;
  return {
    contentType: meta.content_type,
    fileKey: String(fileKey),
    name: meta.filename,
    size: String(meta.size),
  };
};

// レコード body 内の FILE フィールドを in-place で enrich する（取得時）。
export const enrichFileFields = (db: Database.Database, body: RecordBody, fieldRows: FieldRow[]): void => {
  forEachFileCell(body, fieldRows, (cell) => {
    if (!Array.isArray(cell.value)) return;
    cell.value = cell.value.map((item) => enrichFileItem(db, item));
  });
};

// FILE value の 1 要素の fileKey を upload_key → download_key に振り替える。
// download_key が見つからなければ（既に download_key / 不正キー）そのまま。
const resolveFileItem = (db: Database.Database, item: unknown): unknown => {
  if (item == null || typeof item !== "object") return item;
  const fileKey = (item as FileItem).fileKey;
  if (fileKey == null) return item;
  const downloadKey = findDownloadKeyByUploadKey(db, String(fileKey));
  if (!downloadKey) return item;
  // 振り替え後は download_key 参照のみを保持（contentType 等は取得時に enrich で補完）
  return { fileKey: downloadKey };
};

// レコード body 内の FILE フィールドの fileKey を保存前に振り替える（登録/更新時）。
export const resolveUploadKeys = (db: Database.Database, body: RecordBody, fieldRows: FieldRow[]): void => {
  forEachFileCell(body, fieldRows, (cell) => {
    if (!Array.isArray(cell.value)) return;
    cell.value = cell.value.map((item) => resolveFileItem(db, item));
  });
};
