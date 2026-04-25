// CALC + SINGLE_LINE_TEXT (autoCalc) フィールドの式を評価してレコード本体に値を書き込む。
// insertRecord / updateRecord 前に呼び出される想定。
//
// SUBTABLE 内の CALC / SLT autoCalc も対象。
// SUBTABLE 内の autoCalc は、行ごとに「top-level の全フィールド + 同じ行の inner フィールド」を
// スコープとして評価する。CONTAINS の引数となる CHECK_BOX / MULTI_SELECT は同じ行のものを
// 参照する（実機ヘルプ準拠）。

import type { FieldRow } from "../db/fields";
import { collectFieldRefs, type CalcNode } from "./ast";
import {
  asString,
  CalcEvalError,
  evaluate,
  formatNumberAsKintone,
  type CalcResult,
  type CalcValue,
  type CalcValues,
} from "./evaluator";
import { parseExpression } from "./parser";

type RecordCell = { value?: unknown; type?: string } | undefined;
type RecordBody = { [code: string]: RecordCell };
type SubtableRow = { id?: string; value?: { [code: string]: RecordCell } };

type AutoCalcField = {
  code: string;
  ast: CalcNode;
  type: "CALC" | "SINGLE_LINE_TEXT";
  format: string;
};

type FieldDef = {
  type?: string;
  expression?: string;
  format?: string;
  fields?: Record<string, FieldDef & { code?: string }>;
};

const DATE_TYPES = new Set(["DATE", "DATETIME", "CREATED_TIME", "UPDATED_TIME", "TIME"]);

export type ComputeMeta = {
  createdAt?: string;
  updatedAt?: string;
};

export const computeCalcFields = (
  fieldRows: FieldRow[],
  record: RecordBody,
  meta: ComputeMeta = {},
): void => {
  const fieldDefs = parseFieldDefs(fieldRows);
  const topAcs = collectTopLevelAutoCalc(fieldDefs);
  const subAcs = collectSubtableInnerAutoCalc(fieldDefs);
  if (topAcs.length === 0 && subAcs.size === 0) return;

  // 1. SUBTABLE 内 autoCalc を行単位で評価（top-level CALC が SUM(inner_calc) を使うかもしれないので先）
  for (const [subtableCode, innerAcs] of subAcs) {
    const subtableDef = fieldDefs.get(subtableCode);
    if (!subtableDef?.fields) continue;
    const rows = (record[subtableCode]?.value as SubtableRow[] | undefined) ?? [];
    for (const row of rows) {
      computeRow(innerAcs, fieldDefs, subtableDef.fields, record, row, meta);
    }
  }

  // 2. top-level autoCalc を評価
  if (topAcs.length > 0) {
    const values = buildTopLevelValuesMap(fieldDefs, record, meta);
    for (const ac of topAcs) {
      const stored = computeOne(ac, values);
      record[ac.code] = { type: ac.type, value: stored };
      values[ac.code] = stored;
    }
  }
};

// ---------- collect ----------

const parseFieldDefs = (fieldRows: FieldRow[]): Map<string, FieldDef> => {
  const map = new Map<string, FieldDef>();
  for (const row of fieldRows) map.set(row.code, JSON.parse(row.body) as FieldDef);
  return map;
};

const parseAutoCalc = (code: string, def: FieldDef): AutoCalcField | null => {
  if (def.type !== "CALC" && def.type !== "SINGLE_LINE_TEXT") return null;
  const expr = (def.expression ?? "").trim();
  if (expr === "") return null;
  try {
    return {
      code,
      ast: parseExpression(expr),
      type: def.type,
      format: def.format ?? "NUMBER",
    };
  } catch {
    return null;
  }
};

const collectTopLevelAutoCalc = (fieldDefs: Map<string, FieldDef>): AutoCalcField[] => {
  const acs: AutoCalcField[] = [];
  for (const [code, def] of fieldDefs) {
    const ac = parseAutoCalc(code, def);
    if (ac) acs.push(ac);
  }
  return topologicalSort(acs);
};

const collectSubtableInnerAutoCalc = (
  fieldDefs: Map<string, FieldDef>,
): Map<string, AutoCalcField[]> => {
  const result = new Map<string, AutoCalcField[]>();
  for (const [subtableCode, def] of fieldDefs) {
    if (def.type !== "SUBTABLE" || !def.fields) continue;
    const acs: AutoCalcField[] = [];
    for (const [innerCode, innerDef] of Object.entries(def.fields)) {
      const ac = parseAutoCalc(innerCode, innerDef);
      if (ac) acs.push(ac);
    }
    if (acs.length > 0) result.set(subtableCode, topologicalSort(acs));
  }
  return result;
};

const topologicalSort = (acs: AutoCalcField[]): AutoCalcField[] => {
  const codes = new Set(acs.map((c) => c.code));
  const deps = new Map<string, string[]>();
  for (const c of acs) {
    deps.set(c.code, [...collectFieldRefs(c.ast)].filter((ref) => codes.has(ref)));
  }
  const order: string[] = [];
  const visited = new Set<string>();
  const visit = (code: string): void => {
    if (visited.has(code)) return;
    visited.add(code);
    for (const d of deps.get(code) ?? []) visit(d);
    order.push(code);
  };
  for (const c of acs) visit(c.code);
  const byCode = new Map(acs.map((c) => [c.code, c]));
  return order.map((code) => byCode.get(code)!);
};

// ---------- per-row evaluation ----------

const computeRow = (
  innerAcs: AutoCalcField[],
  fieldDefs: Map<string, FieldDef>,
  innerFieldDefs: Record<string, FieldDef>,
  record: RecordBody,
  row: SubtableRow,
  meta: ComputeMeta,
): void => {
  const values: CalcValues = {};
  // top-level fields をスカラ正規化（subtable 配列展開はしない）
  for (const [code, def] of fieldDefs) {
    if (def.type === "SUBTABLE") continue;
    const v = scalarValueFor(def, record[code], meta);
    if (v !== undefined) values[code] = v;
  }
  // 同じ行の inner fields を加える
  for (const [innerCode, innerDef] of Object.entries(innerFieldDefs)) {
    const v = scalarValueFor(innerDef, row.value?.[innerCode], meta);
    if (v !== undefined) values[innerCode] = v;
  }
  const rowBody = (row.value ??= {});
  for (const ac of innerAcs) {
    const stored = computeOne(ac, values);
    rowBody[ac.code] = { type: ac.type, value: stored };
    values[ac.code] = stored;
  }
};

// ---------- top-level values map ----------

const buildTopLevelValuesMap = (
  fieldDefs: Map<string, FieldDef>,
  record: RecordBody,
  meta: ComputeMeta,
): CalcValues => {
  const values: CalcValues = {};
  for (const [code, def] of fieldDefs) {
    if (def.type === "SUBTABLE" && def.fields) {
      const rows = (record[code]?.value as SubtableRow[] | undefined) ?? [];
      for (const [innerCode, inner] of Object.entries(def.fields)) {
        const arr = subtableColumnArray(inner.type, innerCode, rows);
        if (arr !== undefined) values[innerCode] = arr;
      }
      continue;
    }
    const v = scalarValueFor(def, record[code], meta);
    if (v !== undefined) values[code] = v;
  }
  return values;
};

// SUBTABLE 列を SUM / CONTAINS 用に集約。NUMBER → number[]、SLT/DROP_DOWN/RADIO_BUTTON → string[]、
// それ以外（CHECK_BOX 等）は実機が deploy 時に拒否するため対象外。
const subtableColumnArray = (
  innerType: string | undefined,
  innerCode: string,
  rows: SubtableRow[],
): number[] | string[] | undefined => {
  if (innerType === "NUMBER" || innerType === "CALC") {
    return rows.map((r) => Number(r.value?.[innerCode]?.value ?? 0))
      .filter((n) => Number.isFinite(n));
  }
  if (innerType === "SINGLE_LINE_TEXT" || innerType === "DROP_DOWN" || innerType === "RADIO_BUTTON") {
    return rows
      .map((r) => r.value?.[innerCode]?.value)
      .filter((v): v is string => typeof v === "string");
  }
  return undefined;
};

// ---------- value normalization ----------

const scalarValueFor = (
  def: FieldDef,
  cell: RecordCell,
  meta: ComputeMeta,
): CalcValue | undefined => {
  // CREATED_TIME / UPDATED_TIME は cell が無くても meta からフォールバック
  if (def.type === "CREATED_TIME") {
    return dateValueToSeconds("DATETIME", cell?.value ?? meta.createdAt);
  }
  if (def.type === "UPDATED_TIME") {
    return dateValueToSeconds("DATETIME", cell?.value ?? meta.updatedAt);
  }
  if (cell === undefined) return undefined;
  const raw = cell.value;
  if (def.type && DATE_TYPES.has(def.type)) return dateValueToSeconds(def.type, raw);
  if (def.type === "NUMBER" || def.type === "CALC") return toNumberOrZero(raw);
  if (def.type === "CHECK_BOX" || def.type === "MULTI_SELECT") {
    return Array.isArray(raw) ? (raw as unknown[]).map(String) : undefined;
  }
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return undefined;
};

const toNumberOrZero = (raw: unknown): number => {
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const dateValueToSeconds = (fieldType: string, raw: unknown): number => {
  if (raw == null || raw === "") return 0;
  const s = String(raw);
  if (fieldType === "TIME") {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60;
  }
  if (fieldType === "DATE") {
    const t = Date.parse(`${s}T00:00:00Z`);
    return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
};

// ---------- output formatting ----------

const computeOne = (ac: AutoCalcField, values: CalcValues): string => {
  let result: CalcResult;
  try {
    result = evaluate(ac.ast, values);
  } catch (e) {
    if (e instanceof CalcEvalError) return "";
    throw e;
  }
  if (ac.type === "SINGLE_LINE_TEXT") return asString(result);
  return formatCalcOutput(result, ac.format);
};

// CALC は format が数値系のときのみ数値結果を整形して返す。
// 文字列結果（DATE_FORMAT / YEN / & / IF の文字列分岐）は CALC 上では "" になる（実機挙動）。
const formatCalcOutput = (result: CalcResult, format: string): string => {
  if (typeof result === "string") return "";
  if (!Number.isFinite(result)) return "";
  switch (format) {
    case "NUMBER":
    case "NUMBER_DIGIT":   return formatNumberAsKintone(result);
    case "DATETIME":       return formatDateTime(result);
    case "DATE":           return formatDate(result);
    case "TIME":           return formatTime(result);
    case "HOUR_MINUTE":
    case "DAY_HOUR_MINUTE": return formatHourMinute(result);
    default:               return formatNumberAsKintone(result);
  }
};

const formatDateTime = (sec: number): string => {
  const d = new Date(Math.floor(sec) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

const formatDate = (sec: number): string => {
  const d = new Date(Math.floor(sec) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const formatTime = (sec: number): string => {
  const total = ((Math.floor(sec) % 86400) + 86400) % 86400;
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}`;
};

const formatHourMinute = (sec: number): string => {
  const total = Math.max(0, Math.floor(sec));
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}`;
};

const pad2 = (n: number): string => String(n).padStart(2, "0");
