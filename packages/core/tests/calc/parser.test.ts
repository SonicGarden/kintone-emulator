import { describe, expect, test } from "vitest";
import type { CalcNode } from "../../src/calc/ast";
import { parseExpression, CalcParseError } from "../../src/calc/parser";

const parse = (s: string): CalcNode => parseExpression(s);

describe("calc parser", () => {
  test("数値・文字列・真偽値", () => {
    expect(parse("42")).toEqual({ type: "number", value: 42 });
    expect(parse("3.14")).toEqual({ type: "number", value: 3.14 });
    expect(parse('"hello"')).toEqual({ type: "string", value: "hello" });
    expect(parse("TRUE")).toEqual({ type: "bool", value: true });
    expect(parse("false")).toEqual({ type: "bool", value: false });
  });

  test("四則演算と優先度", () => {
    expect(parse("1 + 2 * 3")).toEqual({
      type: "binary", op: "+",
      left:  { type: "number", value: 1 },
      right: { type: "binary", op: "*",
        left: { type: "number", value: 2 }, right: { type: "number", value: 3 } },
    });
  });

  test("^ は右結合", () => {
    expect(parse("2 ^ 3 ^ 2")).toEqual({
      type: "binary", op: "^",
      left:  { type: "number", value: 2 },
      right: { type: "binary", op: "^",
        left: { type: "number", value: 3 }, right: { type: "number", value: 2 } },
    });
  });

  test("単項マイナス", () => {
    expect(parse("-5 + 3")).toEqual({
      type: "binary", op: "+",
      left:  { type: "unary", op: "-", expr: { type: "number", value: 5 } },
      right: { type: "number", value: 3 },
    });
  });

  test("関数呼び出し", () => {
    expect(parse("SUM(a, b, 3)")).toEqual({
      type: "call", name: "SUM",
      args: [
        { type: "field", code: "a" },
        { type: "field", code: "b" },
        { type: "number", value: 3 },
      ],
    });
  });

  test("<> は != のエイリアス", () => {
    expect(parse("a <> b")).toEqual({
      type: "binary", op: "!=",
      left:  { type: "field", code: "a" },
      right: { type: "field", code: "b" },
    });
  });

  test("& 文字列結合", () => {
    expect(parse('"a" & b & "c"').type).toBe("binary");
  });

  test("日本語フィールドコード", () => {
    expect(parse("単価 * 数量")).toEqual({
      type: "binary", op: "*",
      left:  { type: "field", code: "単価" },
      right: { type: "field", code: "数量" },
    });
  });

  test("空文字列 → エラー", () => {
    expect(() => parse("")).toThrow(CalcParseError);
    expect(() => parse("   ")).toThrow(CalcParseError);
  });

  test("全角記号 → 専用エラー", () => {
    const e = (() => { try { parse("a ＋ b"); } catch (x) { return x; } })();
    expect(e).toBeInstanceOf(CalcParseError);
    expect((e as CalcParseError).kind).toBe("fullwidth");
    expect((e as Error).message).toContain("全角記号");
  });

  test("文法エラー", () => {
    expect(() => parse("a +")).toThrow(CalcParseError);
    expect(() => parse("(a + b")).toThrow(CalcParseError);
    expect(() => parse("a b")).toThrow(CalcParseError);
  });

  test("比較の連鎖は拒否", () => {
    expect(() => parse("a < b < c")).toThrow(CalcParseError);
  });
});
