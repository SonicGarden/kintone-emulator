// CALC フィールドの式を評価してレコード本体に値を書き込む。
// insertRecord / updateRecord 前に呼び出される想定。

import type { FieldRow } from "../db/fields";
import { collectFieldRefs, type CalcNode } from "./ast";
import { CalcEvalError, evaluateNumeric, formatNumberAsKintone, type CalcValues } from "./evaluator";
import { parseExpression } from "./parser";

type RecordBody = { [code: string]: { value?: unknown; type?: string } | undefined };
type SubtableRow = { value?: { [code: string]: { value?: unknown; type?: string } | undefined } };

type CalcField = { code: string; ast: CalcNode; format: string };

type FieldDef = {
  type?: string;
  expression?: string;
  format?: string;
  fields?: Record<string, { type?: string }>;
};

const DATE_TYPES = new Set(["DATE", "DATETIME", "CREATED_TIME", "UPDATED_TIME", "TIME"]);

const collectCalcFields = (fieldRows: FieldRow[]): CalcField[] => {
  const calcs: CalcField[] = [];
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;
    if (def.type !== "CALC") continue;
    const expr = (def.expression ?? "").trim();
    if (expr === "") continue;
    try {
      calcs.push({ code: row.code, ast: parseExpression(expr), format: def.format ?? "NUMBER" });
    } catch {
      // deploy 時検証を通っていれば到達しないはず
    }
  }
  return topologicalSort(calcs);
};

const topologicalSort = (calcs: CalcField[]): CalcField[] => {
  const codes = new Set(calcs.map((c) => c.code));
  const deps = new Map<string, string[]>();
  for (const c of calcs) {
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
  for (const c of calcs) visit(c.code);
  const byCode = new Map(calcs.map((c) => [c.code, c]));
  return order.map((code) => byCode.get(code)!);
};

/**
 * record の CALC フィールドに計算結果を書き込む（in-place 更新）。
 * Phase 3: 数値演算 + 比較・論理 + IF / SUM / ROUND 系 + 日付演算（フィールドを Unix 秒に変換）。
 */
export const computeCalcFields = (fieldRows: FieldRow[], record: RecordBody): void => {
  const calcs = collectCalcFields(fieldRows);
  if (calcs.length === 0) return;

  const fieldDefs = parseFieldDefs(fieldRows);
  const values = buildValuesMap(fieldDefs, record);

  for (const calc of calcs) {
    const stored = computeOne(calc, values);
    record[calc.code] = { type: "CALC", value: stored };
    values[calc.code] = stored;
  }
};

const parseFieldDefs = (fieldRows: FieldRow[]): Map<string, FieldDef> => {
  const map = new Map<string, FieldDef>();
  for (const row of fieldRows) {
    map.set(row.code, JSON.parse(row.body) as FieldDef);
  }
  return map;
};

const buildValuesMap = (fieldDefs: Map<string, FieldDef>, record: RecordBody): CalcValues => {
  const values: CalcValues = {};
  for (const [code, def] of fieldDefs) {
    if (def.type === "SUBTABLE" && def.fields) {
      const rows = (record[code]?.value as SubtableRow[] | undefined) ?? [];
      for (const [innerCode, inner] of Object.entries(def.fields)) {
        if (inner.type !== "NUMBER") continue;
        values[innerCode] = rows.map((r) => Number(r.value?.[innerCode]?.value ?? 0))
          .filter((n) => Number.isFinite(n));
      }
      continue;
    }
    const cell = record[code];
    if (cell === undefined) continue;
    const raw = cell.value;
    if (def.type && DATE_TYPES.has(def.type)) {
      values[code] = dateValueToSeconds(def.type, raw);
      continue;
    }
    if (typeof raw === "string" || typeof raw === "number") {
      values[code] = raw;
    }
  }
  return values;
};

/** DATE / DATETIME / TIME 等を Unix 秒（または 0:00 起点の秒数）に変換 */
const dateValueToSeconds = (fieldType: string, raw: unknown): number => {
  if (raw == null || raw === "") return 0;
  const s = String(raw);
  if (fieldType === "TIME") {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60;
  }
  if (fieldType === "DATE") {
    // DATE はユーザー TZ 依存だが、実機観察では UTC 00:00 起点で計算される模様
    const t = Date.parse(`${s}T00:00:00Z`);
    return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
  }
  // DATETIME / CREATED_TIME / UPDATED_TIME は ISO 8601 UTC
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
};

const computeOne = (calc: CalcField, values: CalcValues): string => {
  let n: number;
  try {
    n = evaluateNumeric(calc.ast, values);
  } catch (e) {
    if (e instanceof CalcEvalError) return "";
    throw e;
  }
  return formatCalcOutput(n, calc.format);
};

const formatCalcOutput = (n: number, format: string): string => {
  if (!Number.isFinite(n)) return "";
  switch (format) {
    case "NUMBER":
    case "NUMBER_DIGIT":
      return formatNumberAsKintone(n);
    case "DATETIME":
      return formatDateTime(n);
    case "DATE":
      return formatDate(n);
    case "TIME":
      return formatTime(n);
    case "HOUR_MINUTE":
    case "DAY_HOUR_MINUTE":
      return formatHourMinute(n);
    default:
      return formatNumberAsKintone(n);
  }
};

// 秒 → "YYYY-MM-DDTHH:MM:SSZ"
const formatDateTime = (sec: number): string => {
  const d = new Date(Math.floor(sec) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

// 秒 → "YYYY-MM-DD"
const formatDate = (sec: number): string => {
  const d = new Date(Math.floor(sec) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

// 秒 mod 86400 → "HH:MM"
const formatTime = (sec: number): string => {
  const total = ((Math.floor(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}`;
};

// 総秒数 → "HH:MM"（24h を超える可能性あり）
const formatHourMinute = (sec: number): string => {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}`;
};

const pad2 = (n: number): string => String(n).padStart(2, "0");
