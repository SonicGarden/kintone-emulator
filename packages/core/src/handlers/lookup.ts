import type Database from "better-sqlite3";
import type { FieldRow } from "../db/fields";
import { findRecordsByKey } from "../db/records";
import { errorLookupNotFound } from "./errors";
import type { Locale } from "./validate";

type LookupDef = {
  relatedApp: { app: string | number; code?: string };
  relatedKeyField: string;
  fieldMappings: Array<{ field: string; relatedField: string }>;
};

type FieldDef = {
  type: string;
  lookup?: LookupDef;
};

type RecordInput = Record<string, { value?: unknown }>;

export type LookupContext = {
  db: Database.Database;
  locale?: Locale;
};

type LookupResult =
  | { record: RecordInput; error?: undefined }
  | { record?: undefined; error: Response };

// ルックアップ設定に従って、record のコピー先フィールドを参照先レコードの値で埋める。
// 実 kintone の挙動:
//   - ルックアップキーが record に含まれない → その lookup は何もしない（既存のコピー先を保持）
//   - キーが空文字 / null → コピー先を "" にクリア
//   - キーに一致する参照先レコードが無い → GAIA_LO04 の Response を返す
//   - 一致あり → fieldMappings の field にコピー元 relatedField の値を書き込み
//     クライアントが直接 field に値を送っていても、ルックアップの結果で上書きする（＝クライアント値は無視）
export const applyLookups = (
  fieldRows: FieldRow[],
  record: RecordInput,
  ctx: LookupContext,
): LookupResult => {
  const result: RecordInput = { ...record };
  const locale: Locale = ctx.locale ?? "ja";

  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;
    if (!def.lookup) continue;
    if (!(row.code in record)) continue;

    const lookup = def.lookup;
    const keyCell = result[row.code];
    const keyValue = keyCell?.value;

    if (keyValue == null || keyValue === "") {
      for (const mapping of lookup.fieldMappings) {
        result[mapping.field] = { value: "" };
      }
      continue;
    }

    const foundRows = findRecordsByKey(
      ctx.db,
      lookup.relatedApp.app,
      lookup.relatedKeyField,
      String(keyValue),
    );
    if (foundRows.length === 0) {
      return { error: errorLookupNotFound(row.code, String(keyValue), locale) };
    }

    const foundBody = JSON.parse(foundRows[0]!.body) as RecordInput;
    for (const mapping of lookup.fieldMappings) {
      const sourceCell = foundBody[mapping.relatedField];
      result[mapping.field] = { value: sourceCell?.value ?? "" };
    }
  }

  return { record: result };
};
