// CALC + SINGLE_LINE_TEXT (autoCalc) フィールドの式を評価してレコード本体に値を書き込む。
// insertRecord / updateRecord 前に呼び出される想定。
//
// SUBTABLE 内の CALC / SLT autoCalc も対象。
// SUBTABLE 内の autoCalc は、行ごとに「top-level の全フィールド + 同じ行の inner フィールド」を
// スコープとして評価する。CONTAINS の引数となる CHECK_BOX / MULTI_SELECT は同じ行のものを
// 参照する（実機ヘルプ準拠）。

import type { FieldRow } from "../db/fields";
import type { NumberPrecision } from "../query/number";
import { DEFAULT_NUMBER_PRECISION, decimalToNumber, formatPlainDecimal, parseDecimal } from "../query/number";
import { collectFieldRefs, type CalcNode } from "./ast";
import {
  asString,
  CalcEvalError,
  evaluate,
  type CalcResult,
  type CalcValue,
  type CalcValues,
  type EvalContext,
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
  /** アプリの数値精度。計算の途中の値と結果をこれで丸める */
  numberPrecision?: NumberPrecision;
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
  const ctx: EvalContext = { numberPrecision: meta.numberPrecision ?? DEFAULT_NUMBER_PRECISION };

  // 1. SUBTABLE 内 autoCalc を行単位で評価（top-level CALC が SUM(inner_calc) を使うかもしれないので先）
  for (const [subtableCode, innerAcs] of subAcs) {
    const subtableDef = fieldDefs.get(subtableCode);
    if (!subtableDef?.fields) continue;
    const rows = (record[subtableCode]?.value as SubtableRow[] | undefined) ?? [];
    for (const row of rows) {
      computeRow(innerAcs, fieldDefs, subtableDef.fields, record, row, meta, ctx);
    }
  }

  // 2. top-level autoCalc を評価
  if (topAcs.length > 0) {
    const values = buildTopLevelValuesMap(fieldDefs, record, meta);
    for (const ac of topAcs) {
      const { stored, value } = computeOne(ac, values, ctx);
      record[ac.code] = { type: ac.type, value: stored };
      values[ac.code] = value;
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
  ctx: EvalContext,
): void => {
  const values: CalcValues = {};
  // top-level fields をスカラ正規化（subtable 配列展開はしない）
  for (const [code, def] of fieldDefs) {
    if (def.type === "SUBTABLE") continue;
    values[code] = scalarValueFor(def, record[code], meta);
  }
  // 同じ行の inner fields を加える
  for (const [innerCode, innerDef] of Object.entries(innerFieldDefs)) {
    values[innerCode] = scalarValueFor(innerDef, row.value?.[innerCode], meta);
  }
  const rowBody = (row.value ??= {});
  for (const ac of innerAcs) {
    const { stored, value } = computeOne(ac, values, ctx);
    rowBody[ac.code] = { type: ac.type, value: stored };
    values[ac.code] = value;
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
    values[code] = scalarValueFor(def, record[code], meta);
  }
  return values;
};

// SUBTABLE 列を SUM / CONTAINS 用に集約。NUMBER → 数値の配列 (空のセルは 0)、
// SLT/DROP_DOWN/RADIO_BUTTON → 文字列の配列、それ以外（CHECK_BOX 等）は実機が deploy 時に拒否するため対象外。
const subtableColumnArray = (
  innerType: string | undefined,
  innerCode: string,
  rows: SubtableRow[],
): CalcValue | undefined => {
  if (innerType === "NUMBER" || innerType === "CALC") {
    return {
      kind: "numbers",
      value: rows.map((r) => parseDecimal(String(r.value?.[innerCode]?.value ?? "").trim()) ?? ZERO),
    };
  }
  if (innerType === "SINGLE_LINE_TEXT" || innerType === "DROP_DOWN" || innerType === "RADIO_BUTTON") {
    return {
      kind: "strings",
      value: rows
        .map((r) => r.value?.[innerCode]?.value)
        .filter((v): v is string => typeof v === "string"),
    };
  }
  return undefined;
};

const ZERO = parseDecimal("0")!;
const NULL: CalcValue = { kind: "null" };

// ---------- value normalization ----------

// 未入力は 0 ではなく null にする。実機は式がフィールドの単独参照 (`n` / `d`) のとき
// 未入力なら結果を "" にし、算術 (`n + 1`) のときだけ 0 として扱う (evaluator.ts の num)
const scalarValueFor = (
  def: FieldDef,
  cell: RecordCell,
  meta: ComputeMeta,
): CalcValue => {
  // CREATED_TIME / UPDATED_TIME は cell が無くても meta からフォールバック
  if (def.type === "CREATED_TIME") {
    return secondsValue(dateValueToSeconds("DATETIME", cell?.value ?? meta.createdAt));
  }
  if (def.type === "UPDATED_TIME") {
    return secondsValue(dateValueToSeconds("DATETIME", cell?.value ?? meta.updatedAt));
  }
  if (cell === undefined) return NULL;
  const raw = cell.value;
  if (def.type && DATE_TYPES.has(def.type)) return secondsValue(dateValueToSeconds(def.type, raw));
  if (def.type === "NUMBER" || def.type === "CALC") {
    if (raw == null || raw === "") return NULL;
    const d = parseDecimal(String(raw).trim());
    return d ? { kind: "number", value: d } : NULL;
  }
  if (def.type === "CHECK_BOX" || def.type === "MULTI_SELECT") {
    return Array.isArray(raw) ? { kind: "strings", value: (raw as unknown[]).map(String) } : NULL;
  }
  if (typeof raw === "string") return { kind: "string", value: raw };
  if (typeof raw === "number") return { kind: "number", value: parseDecimal(String(raw)) ?? ZERO };
  return NULL;
};

const secondsValue = (sec: number | null): CalcValue =>
  sec == null ? NULL : { kind: "number", value: parseDecimal(String(sec))! };

/** 日時の値を UNIX 秒にする。未入力は null、解釈できない値は 0 (従来の挙動) */
const dateValueToSeconds = (fieldType: string, raw: unknown): number | null => {
  if (raw == null || raw === "") return null;
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

/**
 * 1 つの autoCalc を評価する。stored はレコードに保存する文字列、value は後続の式から参照される値。
 * value を stored から作り直さないのは、DATETIME などの format で書式化した文字列を
 * 数値に戻せないため (CALC を参照する CALC は計算結果の数値を受け取る)
 */
const computeOne = (ac: AutoCalcField, values: CalcValues, ctx: EvalContext): { stored: string; value: CalcValue } => {
  let result: CalcResult;
  try {
    result = evaluate(ac.ast, values, ctx);
  } catch (e) {
    // 計算エラー (0 除算・桁数超過・型の不一致) は実機も "" で保存する
    if (e instanceof CalcEvalError) return { stored: "", value: NULL };
    throw e;
  }
  if (ac.type === "SINGLE_LINE_TEXT") {
    const stored = asString(result);
    return { stored, value: { kind: "string", value: stored } };
  }
  const stored = formatCalcOutput(result, ac.format);
  if (stored === "") return { stored, value: NULL };
  // 真偽値の CALC は "1" / "0" で保存されるので、参照先にも数値として渡す
  if (result.kind === "bool") return { stored, value: { kind: "number", value: parseDecimal(stored)! } };
  return { stored, value: result };
};

// CALC は format が数値系のときのみ数値結果を整形して返す。
// 文字列結果（DATE_FORMAT / YEN / & / IF の文字列分岐）は CALC 上では "" になる（実機挙動）。
// 未入力（単独参照した未入力のフィールド）も ""。真偽値は "1" / "0"。
const formatCalcOutput = (result: CalcResult, format: string): string => {
  if (result.kind === "string" || result.kind === "null") return "";
  if (result.kind === "bool") return result.value ? "1" : "0";
  const sec = decimalToNumber(result.value);
  switch (format) {
    case "DATETIME":       return formatDateTime(sec);
    case "DATE":           return formatDate(sec);
    case "TIME":           return formatTime(sec);
    case "HOUR_MINUTE":
    case "DAY_HOUR_MINUTE": return formatHourMinute(sec);
    default:               return formatPlainDecimal(result.value);
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
