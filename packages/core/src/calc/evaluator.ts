// Phase 2: 数値演算 (+ - * / ^) と数値フィールド参照の評価。
// サポート外のノード（文字列・真偽値・関数呼び出し・& 比較など）が式中に含まれると
// 評価全体が失敗し、呼び出し側で "" を格納する。

import type { CalcNode } from "./ast";

export type CalcValues = Record<string, string | number | null | undefined>;

export class CalcEvalError extends Error {
  constructor(
    message: string,
    public readonly kind: "unsupported" | "divide_by_zero" | "overflow",
  ) {
    super(message);
  }
}

/**
 * AST を数値として評価する。未サポートノード遭遇は CalcEvalError を投げる。
 * 0 除算も CalcEvalError を投げる（呼び出し側で空文字列に変換）。
 */
export const evaluateNumeric = (node: CalcNode, values: CalcValues): number => {
  switch (node.type) {
    case "number":
      return node.value;

    case "field":
      return toNumber(values[node.code]);

    case "unary": {
      const v = evaluateNumeric(node.expr, values);
      return node.op === "-" ? -v : v;
    }

    case "binary": {
      const l = evaluateNumeric(node.left, values);
      const r = evaluateNumeric(node.right, values);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/":
          if (r === 0) throw new CalcEvalError("divide by zero", "divide_by_zero");
          return l / r;
        case "^": {
          // 指数部の小数は切り下げ
          const exp = Math.trunc(r);
          if (exp > 100 || exp < -100) throw new CalcEvalError("exponent out of range", "overflow");
          return Math.pow(l, exp);
        }
        default:
          throw new CalcEvalError(`unsupported operator ${node.op}`, "unsupported");
      }
    }

    default:
      throw new CalcEvalError(`unsupported node ${node.type}`, "unsupported");
  }
};

/** kintone の数値フィールドは文字列で保存されている。空/undefined は 0 扱い。*/
const toNumber = (v: string | number | null | undefined): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 数値を kintone の API 応答フォーマットで文字列化する。
 * 割り切れない商は小数第 4 位で四捨五入される（実機観察: 1/3 → "0.3333"）。
 * 整数は小数なし、割り切れる小数は末尾ゼロなし。
 */
export const formatNumberAsKintone = (n: number): string => {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  // 4 桁四捨五入
  const rounded = Math.round(n * 10000) / 10000;
  // 末尾ゼロと無駄な小数点を除去
  return String(rounded);
};
