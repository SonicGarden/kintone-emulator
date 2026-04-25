// CALC + SINGLE_LINE_TEXT (autoCalc) フィールドの式を評価してレコード本体に値を書き込む。
// insertRecord / updateRecord 前に呼び出される想定。

import type { FieldRow } from "../db/fields";
import { collectFieldRefs, type CalcNode } from "./ast";
import {
  asString,
  CalcEvalError,
  evaluate,
  formatNumberAsKintone,
  type CalcResult,
  type CalcValues,
} from "./evaluator";
import { parseExpression } from "./parser";

type RecordBody = { [code: string]: { value?: unknown; type?: string } | undefined };
type SubtableRow = { value?: { [code: string]: { value?: unknown; type?: string } | undefined } };

type AutoCalcField = {
  code: string;
  ast: CalcNode;
  type: "CALC" | "SINGLE_LINE_TEXT";
  /** CALC のみ。SINGLE_LINE_TEXT は常に文字列出力 */
  format: string;
};

type FieldDef = {
  type?: string;
  expression?: string;
  format?: string;
  fields?: Record<string, { type?: string }>;
};

const DATE_TYPES = new Set(["DATE", "DATETIME", "CREATED_TIME", "UPDATED_TIME", "TIME"]);

const collectAutoCalcFields = (fieldRows: FieldRow[]): AutoCalcField[] => {
  const acs: AutoCalcField[] = [];
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;
    if (def.type !== "CALC" && def.type !== "SINGLE_LINE_TEXT") continue;
    const expr = (def.expression ?? "").trim();
    if (expr === "") continue;
    try {
      acs.push({
        code: row.code,
        ast: parseExpression(expr),
        type: def.type,
        format: def.format ?? "NUMBER",
      });
    } catch {
      // deploy 時検証を通っていれば到達しないはず
    }
  }
  return topologicalSort(acs);
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

export type ComputeMeta = {
  /** ISO 8601 UTC（"YYYY-MM-DDTHH:MM:SSZ" など）。CREATED_TIME / UPDATED_TIME 参照のフォールバック */
  createdAt?: string;
  updatedAt?: string;
};

export const computeCalcFields = (
  fieldRows: FieldRow[],
  record: RecordBody,
  meta: ComputeMeta = {},
): void => {
  const acs = collectAutoCalcFields(fieldRows);
  if (acs.length === 0) return;

  const fieldDefs = parseFieldDefs(fieldRows);
  const values = buildValuesMap(fieldDefs, record, meta);

  for (const ac of acs) {
    const stored = computeOne(ac, values);
    record[ac.code] = { type: ac.type, value: stored };
    values[ac.code] = stored;
  }
};

const parseFieldDefs = (fieldRows: FieldRow[]): Map<string, FieldDef> => {
  const map = new Map<string, FieldDef>();
  for (const row of fieldRows) {
    map.set(row.code, JSON.parse(row.body) as FieldDef);
  }
  return map;
};

const buildValuesMap = (
  fieldDefs: Map<string, FieldDef>,
  record: RecordBody,
  meta: ComputeMeta,
): CalcValues => {
  const values: CalcValues = {};
  for (const [code, def] of fieldDefs) {
    if (def.type === "SUBTABLE" && def.fields) {
      const rows = (record[code]?.value as SubtableRow[] | undefined) ?? [];
      for (const [innerCode, inner] of Object.entries(def.fields)) {
        if (inner.type === "NUMBER") {
          values[innerCode] = rows.map((r) => Number(r.value?.[innerCode]?.value ?? 0))
            .filter((n) => Number.isFinite(n));
          continue;
        }
        // SLT / DROP_DOWN / RADIO_BUTTON 等の単一文字列型は string[] として CONTAINS で検索可能にする。
        // SUBTABLE 内の CHECK_BOX / MULTI_SELECT は実機が deploy 時に拒否するためここでは扱わない。
        if (inner.type === "SINGLE_LINE_TEXT" || inner.type === "DROP_DOWN" || inner.type === "RADIO_BUTTON") {
          values[innerCode] = rows
            .map((r) => r.value?.[innerCode]?.value)
            .filter((v): v is string => typeof v === "string");
          continue;
        }
      }
      continue;
    }
    // CREATED_TIME / UPDATED_TIME は record body には入らないことが多いため meta からフォールバック
    if (def.type === "CREATED_TIME") {
      const raw = record[code]?.value ?? meta.createdAt;
      values[code] = dateValueToSeconds("DATETIME", raw);
      continue;
    }
    if (def.type === "UPDATED_TIME") {
      const raw = record[code]?.value ?? meta.updatedAt;
      values[code] = dateValueToSeconds("DATETIME", raw);
      continue;
    }
    const cell = record[code];
    if (cell === undefined) continue;
    const raw = cell.value;
    if (def.type && DATE_TYPES.has(def.type)) {
      values[code] = dateValueToSeconds(def.type, raw);
      continue;
    }
    if (def.type === "NUMBER" || def.type === "CALC") {
      values[code] = toNumberOrZero(raw);
      continue;
    }
    // CHECK_BOX / MULTI_SELECT / FILE は文字列配列。CONTAINS の入力として保持する
    if (def.type === "CHECK_BOX" || def.type === "MULTI_SELECT") {
      if (Array.isArray(raw)) values[code] = (raw as unknown[]).map(String);
      continue;
    }
    if (typeof raw === "string" || typeof raw === "number") {
      values[code] = raw;
    }
  }
  return values;
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

const computeOne = (ac: AutoCalcField, values: CalcValues): string => {
  let result: CalcResult;
  try {
    result = evaluate(ac.ast, values);
  } catch (e) {
    if (e instanceof CalcEvalError) return "";
    throw e;
  }
  if (ac.type === "SINGLE_LINE_TEXT") {
    return asString(result);
  }
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
