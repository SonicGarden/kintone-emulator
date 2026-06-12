// レコード取得時に FILE フィールドの value を実 kintone 形式に enrich する。
//
// レコード登録時に送られる FILE の value は `[{ fileKey }]` だけだが、実 kintone は
// レコード取得 API でファイルごとに `contentType` / `name` / `size` を補完して返す。
// このエミュレータは files テーブルにアップロード済みファイルのメタ情報を持つため、
// fileKey をキーに引いて同じ形に整形する。
//
// 注意: 実 kintone では「アップロード時の fileKey」と「ダウンロード用 fileKey」は別物だが、
// このエミュレータは行 ID を両方に流用するため fileKey はそのまま保持する。

import type Database from "better-sqlite3";
import type { FieldRow } from "../db/fields";
import { findFileMeta } from "../db/files";

type Cell = { type?: string; value?: unknown };
type RecordBody = Record<string, Cell>;
type SubtableRow = { id?: string; value?: RecordBody };
type FileItem = { fileKey?: unknown; [key: string]: unknown };

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

// FILE セルの value（配列）を enrich。配列でなければ何もしない。
const enrichFileCell = (db: Database.Database, cell: Cell | undefined): void => {
  if (!cell || !Array.isArray(cell.value)) return;
  cell.value = cell.value.map((item) => enrichFileItem(db, item));
};

// レコード body 内の FILE フィールド（top-level / SUBTABLE 内）を in-place で enrich する。
export const enrichFileFields = (db: Database.Database, body: RecordBody, fieldRows: FieldRow[]): void => {
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as { type: string; fields?: Record<string, { type: string }> };

    if (def.type === "FILE") {
      enrichFileCell(db, body[row.code]);
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
          enrichFileCell(db, r.value[code]);
        }
      }
    }
  }
};
