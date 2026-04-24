// CALC フィールドの式を評価してレコード本体に値を書き込む。
// insertRecord / updateRecord 前に呼び出される想定。

import type { FieldRow } from "../db/fields";
import { collectFieldRefs, type CalcNode } from "./ast";
import { CalcEvalError, evaluateNumeric, formatNumberAsKintone, type CalcValues } from "./evaluator";
import { parseExpression } from "./parser";

type RecordBody = { [code: string]: { value?: unknown; type?: string } | undefined };

type CalcField = {
  code: string;
  ast: CalcNode;
  format: string;
};

/**
 * fieldRows から CALC フィールドを抽出し、トポロジカル順に並べる。
 * 循環参照は deploy 時検証で既に弾かれている前提。
 */
const collectCalcFields = (fieldRows: FieldRow[]): CalcField[] => {
  const calcs: CalcField[] = [];
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as { type?: string; expression?: string; format?: string };
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
 * Phase 2 の範囲: 数値演算 + NUMBER / CALC 参照のみ対応。それ以外は空文字列。
 */
export const computeCalcFields = (fieldRows: FieldRow[], record: RecordBody): void => {
  const calcs = collectCalcFields(fieldRows);
  if (calcs.length === 0) return;

  const values: CalcValues = {};
  for (const [code, field] of Object.entries(record)) {
    const v = field?.value;
    if (typeof v === "string" || typeof v === "number") values[code] = v;
  }

  for (const calc of calcs) {
    const stored = computeOne(calc, values);
    record[calc.code] = { type: "CALC", value: stored };
    values[calc.code] = stored;
  }
};

const computeOne = (calc: CalcField, values: CalcValues): string => {
  try {
    const n = evaluateNumeric(calc.ast, values);
    // format が NUMBER / NUMBER_DIGIT 以外は Phase 2 ではサポート外として空文字列にする
    // （実機は DATETIME 等でも Unix 秒を整形するが、その対応は Phase 3 以降）
    if (calc.format !== "NUMBER" && calc.format !== "NUMBER_DIGIT") return "";
    return formatNumberAsKintone(n);
  } catch (e) {
    if (e instanceof CalcEvalError) return "";
    throw e;
  }
};
