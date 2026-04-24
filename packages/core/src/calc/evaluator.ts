// Phase 3: 数値演算 + 比較 + 論理 + IF / SUM / ROUND 系 + 日付演算。
// 戻り値は数値のみ。ブール値は 0 / 1 として扱う（実機 API 応答に合わせて文字列化時も "0" / "1"）。
// 文字列結果（DATE_FORMAT / YEN / & 連結 / IF の文字列分岐）は Phase 4 以降。

import type { CalcNode } from "./ast";

export type CalcValues = Record<string, CalcValue | undefined>;

/**
 * 値マップに格納される値の型:
 *  - スカラ（number / string）
 *  - SUBTABLE 内 NUMBER フィールドへの参照は number[] として格納し、SUM() で展開する
 *  - その他のセル型は単純な型変換が効く範囲で number 化する（DATE/DATETIME 等は呼び出し側で秒数化済み）
 */
export type CalcValue = string | number | number[];

export class CalcEvalError extends Error {
  constructor(
    message: string,
    public readonly kind: "unsupported" | "divide_by_zero" | "overflow" | "type_mismatch",
  ) {
    super(message);
  }
}

export const evaluateNumeric = (node: CalcNode, values: CalcValues): number => {
  switch (node.type) {
    case "number":
      return node.value;

    case "bool":
      return node.value ? 1 : 0;

    case "field":
      return scalarToNumber(values[node.code]);

    case "unary": {
      const v = evaluateNumeric(node.expr, values);
      return node.op === "-" ? -v : v;
    }

    case "binary":
      return evaluateBinary(node.op, node.left, node.right, values);

    case "call":
      return evaluateCall(node.name.toUpperCase(), node.args, values);

    default:
      throw new CalcEvalError(`unsupported node ${node.type}`, "unsupported");
  }
};

const evaluateBinary = (
  op: string,
  left: CalcNode,
  right: CalcNode,
  values: CalcValues,
): number => {
  const l = evaluateNumeric(left, values);
  const r = evaluateNumeric(right, values);
  switch (op) {
    case "+": return l + r;
    case "-": return l - r;
    case "*": return l * r;
    case "/":
      if (r === 0) throw new CalcEvalError("divide by zero", "divide_by_zero");
      return l / r;
    case "^": {
      const exp = Math.trunc(r);
      if (exp > 100 || exp < -100) throw new CalcEvalError("exponent out of range", "overflow");
      return Math.pow(l, exp);
    }
    case "=":  return l === r ? 1 : 0;
    case "!=": return l !== r ? 1 : 0;
    case "<":  return l <  r ? 1 : 0;
    case "<=": return l <= r ? 1 : 0;
    case ">":  return l >  r ? 1 : 0;
    case ">=": return l >= r ? 1 : 0;
    default:
      // & 連結等は数値評価では扱えない
      throw new CalcEvalError(`unsupported operator ${op}`, "unsupported");
  }
};

const evaluateCall = (name: string, args: CalcNode[], values: CalcValues): number => {
  switch (name) {
    case "SUM":   return evaluateSum(args, values);
    case "IF":    return evaluateIf(args, values);
    case "AND":   return args.every((a) => evaluateNumeric(a, values) !== 0) ? 1 : 0;
    case "OR":    return args.some((a)  => evaluateNumeric(a, values) !== 0) ? 1 : 0;
    case "NOT":   return evaluateNumeric(args[0]!, values) === 0 ? 1 : 0;
    case "ROUND":      return roundWith(args, values, "half-up");
    case "ROUNDUP":    return roundWith(args, values, "up");
    case "ROUNDDOWN":  return roundWith(args, values, "down");
    default:
      throw new CalcEvalError(`unsupported function ${name}`, "unsupported");
  }
};

// SUM は引数が SUBTABLE 内フィールド参照だった場合に配列を展開する。
// それ以外の引数は通常通り数値化して合計する。
const evaluateSum = (args: CalcNode[], values: CalcValues): number => {
  let sum = 0;
  for (const a of args) {
    if (a.type === "field") {
      const v = values[a.code];
      if (Array.isArray(v)) {
        for (const x of v) sum += x;
        continue;
      }
    }
    sum += evaluateNumeric(a, values);
  }
  return sum;
};

const evaluateIf = (args: CalcNode[], values: CalcValues): number => {
  const cond = evaluateNumeric(args[0]!, values);
  return evaluateNumeric(args[cond !== 0 ? 1 : 2]!, values);
};

const roundWith = (
  args: CalcNode[],
  values: CalcValues,
  mode: "half-up" | "up" | "down",
): number => {
  const x = evaluateNumeric(args[0]!, values);
  const digits = Math.trunc(evaluateNumeric(args[1]!, values));
  const factor = Math.pow(10, digits);
  const scaled = x * factor;
  const rounded = mode === "half-up"
    ? Math.round(scaled)
    : mode === "up"
      ? Math.ceil(scaled)
      : Math.floor(scaled);
  return rounded / factor;
};

const scalarToNumber = (v: CalcValue | undefined): number => {
  if (v == null || v === "") return 0;
  if (Array.isArray(v)) return 0; // SUBTABLE 列を SUM 以外で参照しても 0 扱い
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 数値を kintone API 応答フォーマットで文字列化する。割り切れない商は小数第 4 位で四捨五入。
 */
export const formatNumberAsKintone = (n: number): string => {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
};
