import type Database from "better-sqlite3";
import { findFields } from "../db/fields";
import type { FieldRow } from "../db/fields";
import { findRecord, findRecordsByKey } from "../db/records";
import type { RecordRow } from "../db/records";
import { errorLookupNotFound } from "./errors";
import type { Locale } from "./validate";

type FieldMapping = { field: string; relatedField: string };

type LookupDef = {
  relatedApp: { app: string | number; code?: string };
  relatedKeyField: string;
  fieldMappings: FieldMapping[];
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

// 参照先アプリのフィールドタイプを取得する解決関数（アプリ単位でキャッシュ）
type FieldTypeResolver = (appId: string | number, code: string) => string | null;

const makeFieldTypeResolver = (db: Database.Database): FieldTypeResolver => {
  const cache = new Map<string, FieldRow[]>();
  return (appId, code) => {
    const key = String(appId);
    let rows = cache.get(key);
    if (!rows) {
      rows = findFields(db, appId);
      cache.set(key, rows);
    }
    const row = rows.find((r) => r.code === code);
    return row ? (JSON.parse(row.body) as { type: string }).type : null;
  };
};

// キー値から参照先レコードを 1 件取得。RECORD_NUMBER 型フィールドがキーなら records.id で検索
const findLookupTarget = (
  db: Database.Database,
  lookup: LookupDef,
  keyValue: string,
  resolveType: FieldTypeResolver,
): RecordRow | undefined => {
  if (resolveType(lookup.relatedApp.app, lookup.relatedKeyField) === "RECORD_NUMBER") {
    return findRecord(db, String(lookup.relatedApp.app), keyValue);
  }
  return findRecordsByKey(db, lookup.relatedApp.app, lookup.relatedKeyField, keyValue)[0];
};

// fieldMappings に従って参照先レコードから値を取り出して新しいセル群を作る
const cellsFromTarget = (
  target: RecordRow,
  appId: string | number,
  mappings: FieldMapping[],
  resolveType: FieldTypeResolver,
): RecordInput => {
  const body = JSON.parse(target.body) as RecordInput;
  const cells: RecordInput = {};
  for (const { field, relatedField } of mappings) {
    const type = resolveType(appId, relatedField);
    cells[field] = {
      value: type === "RECORD_NUMBER" ? String(target.id) : body[relatedField]?.value ?? "",
    };
  }
  return cells;
};

// fieldMappings のコピー先を "" でクリア
const emptyCells = (mappings: FieldMapping[]): RecordInput => {
  const cells: RecordInput = {};
  for (const { field } of mappings) cells[field] = { value: "" };
  return cells;
};

// ルックアップ設定に従って、record のコピー先フィールドを参照先レコードの値で埋める。
// 実 kintone の挙動:
//   - ルックアップキーが record に含まれない → その lookup は何もしない（既存のコピー先を保持）
//   - キーが空文字 / null → コピー先を "" にクリア
//   - キーに一致する参照先レコードが無い → GAIA_LO04 の Response を返す
//   - 一致あり → fieldMappings の field にコピー元 relatedField の値を書き込み
//     クライアントが直接 field に値を送っていても、ルックアップの結果で上書きする（＝クライアント値は無視）
//   - relatedKeyField / relatedField が RECORD_NUMBER 型なら records.id で検索・コピー
export const applyLookups = (
  fieldRows: FieldRow[],
  record: RecordInput,
  ctx: LookupContext,
): LookupResult => {
  const result: RecordInput = { ...record };
  const locale: Locale = ctx.locale ?? "ja";
  const resolveType = makeFieldTypeResolver(ctx.db);

  for (const row of fieldRows) {
    const lookup = (JSON.parse(row.body) as FieldDef).lookup;
    if (!lookup) continue;
    if (!(row.code in record)) continue;

    const keyValue = result[row.code]?.value;
    if (keyValue == null || keyValue === "") {
      Object.assign(result, emptyCells(lookup.fieldMappings));
      continue;
    }

    const target = findLookupTarget(ctx.db, lookup, String(keyValue), resolveType);
    if (!target) {
      return { error: errorLookupNotFound(row.code, String(keyValue), locale) };
    }
    Object.assign(result, cellsFromTarget(target, lookup.relatedApp.app, lookup.fieldMappings, resolveType));
  }
  return { record: result };
};
