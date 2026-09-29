import { describe, expect, test } from "vitest";
import { CalcEvalError, evaluate, type CalcValue, type CalcValues } from "../../src/calc/evaluator";
import { parseExpression } from "../../src/calc/parser";
import type { NumberPrecision } from "../../src/query/number";
import { formatPlainDecimal, parseDecimal } from "../../src/query/number";

const num = (s: string): CalcValue => ({ kind: "number", value: parseDecimal(s)! });
const str = (s: string): CalcValue => ({ kind: "string", value: s });
const nums = (...xs: string[]): CalcValue => ({ kind: "numbers", value: xs.map((x) => parseDecimal(x)!) });
const strs = (...xs: string[]): CalcValue => ({ kind: "strings", value: xs });

/** 評価結果を比べやすい形にする: 数値は通常の表記の文字列、真偽値は boolean、未入力は null */
const run = (expr: string, values: CalcValues = {}, numberPrecision?: NumberPrecision) => {
  const r = evaluate(parseExpression(expr), values, numberPrecision ? { numberPrecision } : undefined);
  switch (r.kind) {
    case "number": return formatPlainDecimal(r.value);
    case "string": return { text: r.value };
    case "bool":   return r.value;
    case "null":   return null;
  }
};

const P5_UP: NumberPrecision = { digits: "5", decimalPlaces: "2", roundingMode: "UP" };
const P30: NumberPrecision = { digits: "30", decimalPlaces: "10", roundingMode: "HALF_EVEN" };

describe("数値の演算", () => {
  test("四則演算と優先度", () => {
    expect(run("1 + 2")).toBe("3");
    expect(run("10 - 3")).toBe("7");
    expect(run("4 * 5")).toBe("20");
    expect(run("10 / 4")).toBe("2.5");
    expect(run("1 + 2 * 3")).toBe("7");
    expect(run("(1 + 2) * 3")).toBe("9");
    expect(run("-5 + 3")).toBe("-2");
    expect(run("-(2 + 3)")).toBe("-5");
    expect(run("+a", { a: num("7") })).toBe("7");
  });

  test("浮動小数点の誤差が出ない", () => {
    expect(run("0.1 + 0.2")).toBe("0.3");
    expect(run("a + 0", { a: num("999999999999.9999") })).toBe("999999999999.9999");
  });

  test("べき乗（右結合、指数の小数部は切り捨て）", () => {
    expect(run("2 ^ 3")).toBe("8");
    expect(run("2 ^ 3 ^ 2")).toBe("512");
    expect(run("4 ^ 1.5")).toBe("4");
    expect(run("4 ^ -2")).toBe("0.0625");
    expect(() => run("2 ^ 101")).toThrow(CalcEvalError);
  });

  test("0 除算はエラー", () => {
    expect(() => run("1 / 0")).toThrow(CalcEvalError);
    expect(() => run("0 / 0")).toThrow(CalcEvalError);
  });

  test("比較は真偽値を返す", () => {
    expect(run("3 > 2")).toBe(true);
    expect(run("3 < 2")).toBe(false);
    expect(run("3 = 3")).toBe(true);
    expect(run("3 != 3")).toBe(false);
    expect(run("3 <> 4")).toBe(true);
    expect(run("a >= b", { a: num("5"), b: num("5") })).toBe(true);
  });
});

describe("数値精度による丸めと桁数", () => {
  test("リテラルと途中の値を 1 つずつ小数第 4 位に丸める（既定の精度）", () => {
    expect(run("1 / 3")).toBe("0.3333");
    expect(run("1 / 3 * 3")).toBe("0.9999");
    expect(run("2 / 3 * 3")).toBe("2.0001");
    expect(run("0.00015 * 10000")).toBe("2");
    expect(run("0.00015 + 0.00015")).toBe("0.0004");
    expect(run("0.00025 * 1")).toBe("0.0002");
    expect(run("0.00005 * 1")).toBe("0");
  });

  test("丸めかたと小数部の桁数はアプリの数値精度に従う", () => {
    expect(run("1 / 3", {}, P5_UP)).toBe("0.34");
    expect(run("1 / 3 * 3", {}, P5_UP)).toBe("1.02");
    expect(run("-0.00001", {}, P5_UP)).toBe("-0.01");
    expect(run("1 / 3", {}, P30)).toBe("0.3333333333");
    expect(run("10 / 7", {}, P30)).toBe("1.4285714286");
  });

  test("途中の値でも整数部が桁数を超えたらエラー", () => {
    expect(() => run("999999999999 + 1")).toThrow(CalcEvalError);
    expect(() => run("a * 10 / 10", { a: num("999999999999") })).toThrow(CalcEvalError);
    // 5 桁 / 小数 2 桁ではリテラルの 10000 だけで超える
    expect(() => run("0.01 * 10000", {}, P5_UP)).toThrow(CalcEvalError);
    expect(run("999999999999 + 1", {}, P30)).toBe("1000000000000");
  });

  test("べき乗は途中ではなく結果だけを丸める", () => {
    expect(run("2 ^ -20", {}, P5_UP)).toBe("0.01");
    expect(run("2 ^ -20", {}, P30)).toBe("0.0000009537");
  });
});

describe("未入力の扱い", () => {
  test("単独参照は未入力のまま", () => {
    expect(run("a")).toBeNull();
    expect(run("(a)")).toBeNull();
  });

  test("算術・比較・SUM・ROUND では 0 として扱う", () => {
    expect(run("a + 1")).toBe("1");
    expect(run("-a")).toBe("0");
    expect(run("a + b", { a: num("5") })).toBe("5");
    expect(run("a = 0")).toBe(true);
    expect(run("SUM(a)")).toBe("0");
    expect(run("ROUND(a, 0)")).toBe("0");
  });

  test("IF の分岐先は未入力のまま返す", () => {
    expect(run("IF(1 > 0, a, 2)")).toBeNull();
    expect(run("IF(1 > 0, a, 2)", { a: num("5") })).toBe("5");
  });

  test("& では空文字として連結する", () => {
    expect(run('a & "x"')).toEqual({ text: "x" });
  });
});

describe("真偽値", () => {
  test("IF の条件・AND / OR / NOT の引数は真偽値でなければエラー", () => {
    expect(() => run("IF(1, 1, 2)")).toThrow(CalcEvalError);
    expect(() => run("IF(a, 1, 2)", { a: num("5") })).toThrow(CalcEvalError);
    expect(() => run("AND(1, 1)")).toThrow(CalcEvalError);
    expect(() => run("AND(1 > 0, 1)")).toThrow(CalcEvalError);
    expect(() => run("NOT(1)")).toThrow(CalcEvalError);
  });

  test("真偽値の条件なら動く", () => {
    expect(run("IF(a > 10, a * 2, a / 2)", { a: num("15") })).toBe("30");
    expect(run("IF(a > 10, a * 2, a / 2)", { a: num("4") })).toBe("2");
    expect(run("AND(a > 0, a < 10)", { a: num("5") })).toBe(true);
    expect(run("OR(1 < 0, 2 > 1)")).toBe(true);
    expect(run("NOT(a > 0)")).toBe(true);
    expect(run("TRUE")).toBe(true);
    expect(run("FALSE")).toBe(false);
  });

  test("真偽値を算術に使うとエラー、& では true / false", () => {
    expect(() => run("(1 > 0) + 1")).toThrow(CalcEvalError);
    expect(() => run("SUM(1 > 0, 1)")).toThrow(CalcEvalError);
    expect(run('(1 > 0) & "x"')).toEqual({ text: "truex" });
  });
});

describe("関数", () => {
  test("ROUND は 0 から遠い方への四捨五入、ROUNDUP / ROUNDDOWN は 0 から遠い方 / 近い方", () => {
    expect(run("ROUND(3.14159, 2)")).toBe("3.14");
    expect(run("ROUND(2.5, 0)")).toBe("3");
    expect(run("ROUND(-2.5, 0)")).toBe("-3");
    expect(run("ROUND(-0.5, 0)")).toBe("-1");
    expect(run("ROUND(1.25, 1)")).toBe("1.3");
    expect(run("ROUND(1.005, 2)")).toBe("1.01");
    expect(run("ROUNDUP(3.14159, 2)")).toBe("3.15");
    expect(run("ROUNDUP(-1.21, 1)")).toBe("-1.3");
    expect(run("ROUNDDOWN(-1.29, 1)")).toBe("-1.2");
    expect(run("ROUNDDOWN(3.99, 0)")).toBe("3");
  });

  test("SUM は可変長で、SUBTABLE 列を展開する", () => {
    expect(run("SUM(1, 2, 3)")).toBe("6");
    expect(run("SUM(a, b, 10)", { a: num("1"), b: num("2") })).toBe("13");
    expect(run("SUM(qty)", { qty: nums("10", "20", "30") })).toBe("60");
    expect(run("SUM(qty, a)", { qty: nums("1", "0"), a: num("5") })).toBe("6");
  });

  test("SUM は行が無い SUBTABLE 列をエラーにする", () => {
    expect(() => run("SUM(qty)", { qty: nums() })).toThrow(CalcEvalError);
    expect(() => run("SUM(qty) + 1", { qty: nums() })).toThrow(CalcEvalError);
  });

  test("SUBTABLE 列を SUM 以外で参照すると 0", () => {
    expect(run("qty + 1", { qty: nums("10", "20") })).toBe("1");
  });

  test("文字列と IF の文字列分岐", () => {
    expect(run('"hello"')).toEqual({ text: "hello" });
    expect(run('"a" & "b"')).toEqual({ text: "ab" });
    expect(run('a & " " & b', { a: str("100"), b: str("20") })).toEqual({ text: "100 20" });
    expect(run('"x=" & 1 + 2')).toEqual({ text: "x=3" });
    expect(run('IF(a > 10, "big", "small")', { a: num("15") })).toEqual({ text: "big" });
    expect(run("a + 1", { a: str("abc") })).toBe("1");
  });

  test("YEN — 千区切り + ¥", () => {
    expect(run("YEN(1000, 0)")).toEqual({ text: "¥1,000" });
    expect(run("YEN(1234567, 0)")).toEqual({ text: "¥1,234,567" });
    expect(run("YEN(1000.4, 0)")).toEqual({ text: "¥1,000" });
    expect(run("YEN(1000.5, 0)")).toEqual({ text: "¥1,001" });
    expect(run("YEN(1234.5, 1)")).toEqual({ text: "¥1,234.5" });
    expect(run("YEN(1234, 2)")).toEqual({ text: "¥1,234.00" });
    expect(run("YEN(-500, 0)")).toEqual({ text: "-¥500" });
  });

  test("DATE_FORMAT — UNIX 秒", () => {
    // 2025-04-25 09:40:00 UTC ≈ 1745574000s
    expect(run('DATE_FORMAT(1745574000, "YYYY-MM-dd", "UTC")')).toEqual({ text: "2025-04-25" });
    // Asia/Tokyo は +9h、UTC 09:40 → JST 18:40
    expect(run('DATE_FORMAT(1745574000, "HH:mm", "Asia/Tokyo")')).toEqual({ text: "18:40" });
    expect(run('DATE_FORMAT(1745574000, "YYYY MMM d", "UTC")')).toEqual({ text: "2025 Apr 25" });
    // system は UTC 扱い
    expect(run('DATE_FORMAT(0, "YYYY-MM-dd HH:mm:ss", "system")')).toEqual({ text: "1970-01-01 00:00:00" });
  });

  test("CONTAINS は複数選択の配列に含まれるかを真偽値で返す", () => {
    expect(run('CONTAINS(tag, "x")', { tag: strs("x", "y") })).toBe(true);
    expect(run('CONTAINS(tag, "z")', { tag: strs("x", "y") })).toBe(false);
    expect(run('CONTAINS(tag, "x")', { tag: strs() })).toBe(false);
    expect(run('IF(CONTAINS(tag, "x"), 1, 2)', { tag: strs("x") })).toBe("1");
  });

  test("CONTAINS — 単一値フィールドは型不適合で例外", () => {
    expect(() => run('CONTAINS(s, "yes")', { s: str("yes") })).toThrow(CalcEvalError);
    expect(() => run('CONTAINS(s, "yes")')).toThrow(CalcEvalError);
  });
});
