import { describe, expect, test } from "vitest";
import { CalcEvalError, evaluateNumeric, formatNumberAsKintone } from "../../src/calc/evaluator";
import { parseExpression } from "../../src/calc/parser";

const evalExpr = (expr: string, values: Record<string, string | number> = {}): number =>
  evaluateNumeric(parseExpression(expr), values);

describe("evaluateNumeric", () => {
  test("数値リテラル", () => {
    expect(evalExpr("42")).toBe(42);
    expect(evalExpr("3.14")).toBe(3.14);
  });

  test("四則演算", () => {
    expect(evalExpr("1 + 2")).toBe(3);
    expect(evalExpr("10 - 3")).toBe(7);
    expect(evalExpr("4 * 5")).toBe(20);
    expect(evalExpr("10 / 4")).toBe(2.5);
  });

  test("優先度", () => {
    expect(evalExpr("1 + 2 * 3")).toBe(7);
    expect(evalExpr("(1 + 2) * 3")).toBe(9);
  });

  test("単項マイナス", () => {
    expect(evalExpr("-5 + 3")).toBe(-2);
    expect(evalExpr("-(2 + 3)")).toBe(-5);
  });

  test("べき乗（右結合、指数切り下げ）", () => {
    expect(evalExpr("2 ^ 3")).toBe(8);
    expect(evalExpr("2 ^ 3 ^ 2")).toBe(512);
    expect(evalExpr("4 ^ 1.5")).toBe(4);
    expect(evalExpr("4 ^ -2")).toBe(0.0625);
  });

  test("指数範囲外", () => {
    expect(() => evalExpr("2 ^ 101")).toThrow(CalcEvalError);
  });

  test("0 除算", () => {
    expect(() => evalExpr("1 / 0")).toThrow(CalcEvalError);
    expect(() => evalExpr("0 / 0")).toThrow(CalcEvalError);
  });

  test("フィールド参照", () => {
    expect(evalExpr("a + b", { a: 10, b: 3 })).toBe(13);
    expect(evalExpr("a + b", { a: "10", b: "3" })).toBe(13);
  });

  test("空・未定義フィールドは 0 扱い", () => {
    expect(evalExpr("a + b", {})).toBe(0);
    expect(evalExpr("a + b", { a: "" })).toBe(0);
    expect(evalExpr("a + 5", { a: "3" })).toBe(8);
  });

  test("文字列フィールドを含む式は未サポートでもフィールド参照自体は数値化される", () => {
    expect(evalExpr("a + 1", { a: "abc" })).toBe(1);
  });

  test("未サポートのノード", () => {
    expect(() => evaluateNumeric(parseExpression('"x"'), {})).toThrow(CalcEvalError);
    expect(() => evaluateNumeric(parseExpression("TRUE"), {})).toThrow(CalcEvalError);
    expect(() => evaluateNumeric(parseExpression("a = b"), { a: 1, b: 1 })).toThrow(CalcEvalError);
    expect(() => evaluateNumeric(parseExpression('a & "x"'), { a: 1 })).toThrow(CalcEvalError);
  });
});

describe("formatNumberAsKintone", () => {
  test("整数", () => {
    expect(formatNumberAsKintone(13)).toBe("13");
    expect(formatNumberAsKintone(-5)).toBe("-5");
    expect(formatNumberAsKintone(0)).toBe("0");
  });

  test("割り切れる小数は末尾ゼロなし", () => {
    expect(formatNumberAsKintone(0.7)).toBe("0.7");
    expect(formatNumberAsKintone(10)).toBe("10");
  });

  test("割り切れない商は小数第 4 位で丸め", () => {
    expect(formatNumberAsKintone(1 / 3)).toBe("0.3333");
    expect(formatNumberAsKintone(10 / 3)).toBe("3.3333");
    expect(formatNumberAsKintone(1 / 7)).toBe("0.1429");
  });

  test("非有限は空文字列", () => {
    expect(formatNumberAsKintone(NaN)).toBe("");
    expect(formatNumberAsKintone(Infinity)).toBe("");
  });
});
