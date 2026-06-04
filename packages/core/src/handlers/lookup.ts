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
  fields?: Record<string, FieldDef & { code?: string }>;
};

type RecordInput = Record<string, { value?: unknown }>;
type SubtableRow = { id?: string; value?: RecordInput };

export type LookupContext = {
  db: Database.Database;
  locale?: Locale;
};

type LookupResult =
  | { record: RecordInput; error?: undefined }
  | { record?: undefined; error: Response };

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

const emptyCells = (mappings: FieldMapping[]): RecordInput => {
  const cells: RecordInput = {};
  for (const { field } of mappings) cells[field] = { value: "" };
  return cells;
};

type CellsResolution =
  | { kind: "noop" }
  | { kind: "cells"; cells: RecordInput }
  | { kind: "error"; error: Response };

// ルックアップ 1 件分の解決。
//   - キーが record に含まれない → "noop"（何もしない）
//   - キーが空 / null → コピー先を "" にクリア
//   - キーに一致する参照先がない → "error"
//   - 一致あり → 参照先の値を fieldMappings に従ってコピー
const resolveLookupCells = (
  keyCode: string,
  lookup: LookupDef,
  cells: RecordInput,
  ctx: LookupContext,
  resolveType: FieldTypeResolver,
): CellsResolution => {
  if (!(keyCode in cells)) return { kind: "noop" };
  const keyValue = cells[keyCode]?.value;
  if (keyValue == null || keyValue === "") {
    return { kind: "cells", cells: emptyCells(lookup.fieldMappings) };
  }
  const target = findLookupTarget(ctx.db, lookup, String(keyValue), resolveType);
  if (!target) {
    return { kind: "error", error: errorLookupNotFound(keyCode, String(keyValue), ctx.locale ?? "ja") };
  }
  return { kind: "cells", cells: cellsFromTarget(target, lookup.relatedApp.app, lookup.fieldMappings, resolveType) };
};

// ルックアップ設定に従って、record のコピー先フィールドを参照先レコードの値で埋める。
// 実 kintone の挙動:
//   - ルックアップキーが record に含まれない → その lookup は何もしない（既存のコピー先を保持）
//   - キーが空文字 / null → コピー先を "" にクリア
//   - キーに一致する参照先レコードが無い → GAIA_LO04 の Response を返す
//   - 一致あり → fieldMappings の field にコピー元 relatedField の値を書き込み
//   - relatedKeyField / relatedField が RECORD_NUMBER 型なら records.id で検索・コピー
//
// SUBTABLE 内 LOOKUP も同様に動作する。各行ごとに「同じ行の inner LOOKUP」を解決し、
// 参照先の値はその行の inner コピー先に書き込まれる。
export const applyLookups = (
  fieldRows: FieldRow[],
  record: RecordInput,
  ctx: LookupContext,
): LookupResult => {
  const result: RecordInput = { ...record };
  const resolveType = makeFieldTypeResolver(ctx.db);

  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;

    if (def.type === "SUBTABLE" && def.fields) {
      const innerLookups = Object.entries(def.fields)
        .filter(([, f]) => f.lookup)
        .map(([code, f]) => [code, f.lookup!] as const);
      if (innerLookups.length === 0) continue;
      const rows = (result[row.code]?.value as SubtableRow[] | undefined) ?? [];
      const newRows: SubtableRow[] = [];
      for (const subRow of rows) {
        const cells: RecordInput = { ...(subRow.value ?? {}) };
        for (const [innerKeyCode, innerLookup] of innerLookups) {
          const resolved = resolveLookupCells(innerKeyCode, innerLookup, cells, ctx, resolveType);
          if (resolved.kind === "error") return { error: resolved.error };
          if (resolved.kind === "cells") Object.assign(cells, resolved.cells);
        }
        newRows.push({ ...subRow, value: cells });
      }
      if (result[row.code] != null) {
        result[row.code] = { ...result[row.code]!, value: newRows };
      }
      continue;
    }

    if (!def.lookup) continue;
    const resolved = resolveLookupCells(row.code, def.lookup, result, ctx, resolveType);
    if (resolved.kind === "error") return { error: resolved.error };
    if (resolved.kind === "cells") Object.assign(result, resolved.cells);
  }
  return { record: result };
};
