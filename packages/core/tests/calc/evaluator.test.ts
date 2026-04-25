import { describe, expect, test } from "vitest";
import { CalcEvalError, evaluate, evaluateNumeric, formatNumberAsKintone } from "../../src/calc/evaluator";
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
    expect(() => evaluateNumeric(parseExpression('a & "x"'), { a: 1 })).toThrow(CalcEvalError);
  });

  test("比較演算子はブール値 (0/1) を返す", () => {
    expect(evalExpr("3 > 2")).toBe(1);
    expect(evalExpr("3 < 2")).toBe(0);
    expect(evalExpr("3 = 3")).toBe(1);
    expect(evalExpr("3 != 3")).toBe(0);
    expect(evalExpr("a >= b", { a: 5, b: 5 })).toBe(1);
    expect(evalExpr("a <= b", { a: 5, b: 5 })).toBe(1);
    expect(evalExpr("a <= b", { a: 6, b: 5 })).toBe(0);
    // <> は != のエイリアス
    expect(evalExpr("3 <> 3")).toBe(0);
    expect(evalExpr("3 <> 4")).toBe(1);
  });

  test("単項 + は値をそのまま返す", () => {
    expect(evalExpr("+5")).toBe(5);
    expect(evalExpr("+(-3)")).toBe(-3);
    expect(evalExpr("+a", { a: 7 })).toBe(7);
  });

  test("AND / OR / NOT", () => {
    expect(evalExpr("AND(1, 1, 1)")).toBe(1);
    expect(evalExpr("AND(1, 0, 1)")).toBe(0);
    expect(evalExpr("OR(0, 0, 1)")).toBe(1);
    expect(evalExpr("OR(0, 0, 0)")).toBe(0);
    expect(evalExpr("NOT(0)")).toBe(1);
    expect(evalExpr("NOT(1)")).toBe(0);
    expect(evalExpr("AND(a > 0, a < 10)", { a: 5 })).toBe(1);
  });

  test("TRUE / FALSE", () => {
    expect(evalExpr("TRUE")).toBe(1);
    expect(evalExpr("FALSE")).toBe(0);
  });

  test("IF — 数値分岐", () => {
    expect(evalExpr("IF(a > 10, a * 2, a / 2)", { a: 15 })).toBe(30);
    expect(evalExpr("IF(a > 10, a * 2, a / 2)", { a: 4 })).toBe(2);
    expect(evalExpr("IF(0, 1, 2)")).toBe(2);
    expect(evalExpr("IF(1, 1, 2)")).toBe(1);
  });

  test("ROUND / ROUNDUP / ROUNDDOWN", () => {
    expect(evalExpr("ROUND(3.14159, 2)")).toBe(3.14);
    expect(evalExpr("ROUNDUP(3.14159, 2)")).toBe(3.15);
    expect(evalExpr("ROUNDDOWN(3.14159, 2)")).toBe(3.14);
    expect(evalExpr("ROUND(3.5, 0)")).toBe(4);
    expect(evalExpr("ROUNDDOWN(3.99, 0)")).toBe(3);
  });

  test("SUM — 可変長", () => {
    expect(evalExpr("SUM(1, 2, 3)")).toBe(6);
    expect(evalExpr("SUM(a, b, 10)", { a: 1, b: 2 })).toBe(13);
  });

  test("SUM — SUBTABLE 内 NUMBER フィールド配列を展開", () => {
    expect(evaluateNumeric(parseExpression("SUM(qty)"), { qty: [10, 20, 30] })).toBe(60);
    expect(evaluateNumeric(parseExpression("SUM(qty)"), { qty: [] })).toBe(0);
  });

  test("配列を SUM 以外で参照すると 0", () => {
    expect(evaluateNumeric(parseExpression("qty + 1"), { qty: [10, 20] })).toBe(1);
  });
});

describe("evaluate (string-aware)", () => {
  test("文字列リテラルが文字列で返る", () => {
    expect(evaluate(parseExpression('"hello"'), {})).toBe("hello");
  });

  test("& による文字列連結", () => {
    expect(evaluate(parseExpression('"a" & "b"'), {})).toBe("ab");
    expect(evaluate(parseExpression('a & " " & b'), { a: "100", b: "20" })).toBe("100 20");
    expect(evaluate(parseExpression('"x=" & 1 + 2'), {})).toBe("x=3");
  });

  test("IF の文字列分岐", () => {
    expect(evaluate(parseExpression('IF(a > 10, "big", "small")'), { a: 15 })).toBe("big");
    expect(evaluate(parseExpression('IF(a > 10, "big", "small")'), { a: 5 })).toBe("small");
  });

  test("YEN — 千区切り + ¥", () => {
    expect(evaluate(parseExpression("YEN(1000, 0)"), {})).toBe("¥1,000");
    expect(evaluate(parseExpression("YEN(1234567, 0)"), {})).toBe("¥1,234,567");
    expect(evaluate(parseExpression("YEN(1000.4, 0)"), {})).toBe("¥1,000");
    expect(evaluate(parseExpression("YEN(1000.5, 0)"), {})).toBe("¥1,001");
    expect(evaluate(parseExpression("YEN(1234.5, 1)"), {})).toBe("¥1,234.5");
    expect(evaluate(parseExpression("YEN(-500, 0)"), {})).toBe("-¥500");
  });

  test("DATE_FORMAT — UNIX 秒", () => {
    // 2025-04-25 09:40:00 UTC ≈ 1745574000s
    expect(evaluate(parseExpression('DATE_FORMAT(1745574000, "YYYY-MM-dd", "UTC")'), {})).toBe("2025-04-25");
    // Asia/Tokyo は +9h、UTC 09:40 → JST 18:40
    expect(evaluate(parseExpression('DATE_FORMAT(1745574000, "HH:mm", "Asia/Tokyo")'), {})).toBe("18:40");
    expect(evaluate(parseExpression('DATE_FORMAT(1745574000, "YYYY MMM d", "UTC")'), {})).toBe("2025 Apr 25");
  });

  test("DATE_FORMAT — system は UTC 扱い", () => {
    expect(evaluate(parseExpression('DATE_FORMAT(0, "YYYY-MM-dd HH:mm:ss", "system")'), {})).toBe("1970-01-01 00:00:00");
  });

  test("CONTAINS — string[] 包含", () => {
    expect(evaluate(parseExpression('CONTAINS(tag, "x")'), { tag: ["x", "y"] })).toBe(1);
    expect(evaluate(parseExpression('CONTAINS(tag, "z")'), { tag: ["x", "y"] })).toBe(0);
    expect(evaluate(parseExpression('CONTAINS(tag, "x")'), { tag: [] })).toBe(0);
  });

  test("CONTAINS — 単一値フィールドは型不適合で例外", () => {
    expect(() => evaluate(parseExpression('CONTAINS(s, "yes")'), { s: "yes" })).toThrow(CalcEvalError);
    expect(() => evaluate(parseExpression('CONTAINS(s, "yes")'), {})).toThrow(CalcEvalError);
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
