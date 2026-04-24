import { describe, expect, test } from "vitest";
import { computeCalcFields } from "../../src/calc/compute";
import type { FieldRow } from "../../src/db/fields";

const field = (code: string, def: Record<string, unknown>): FieldRow => ({
  code,
  body: JSON.stringify({ code, ...def }),
});

describe("computeCalcFields", () => {
  test("単純な加算", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("b", { type: "NUMBER" }),
      field("c", { type: "CALC", expression: "a + b" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {
      a: { value: "10" },
      b: { value: "3" },
    };
    computeCalcFields(rows, record);
    expect(record.c).toEqual({ type: "CALC", value: "13" });
  });

  test("CALC が CALC を参照（トポロジカル順）", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("y", { type: "CALC", expression: "x + 1" }),
      field("x", { type: "CALC", expression: "a * 2" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { a: { value: "10" } };
    computeCalcFields(rows, record);
    expect(record.x).toEqual({ type: "CALC", value: "20" });
    expect(record.y).toEqual({ type: "CALC", value: "21" });
  });

  test("0 除算は空文字列", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("c", { type: "CALC", expression: "a / 0" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { a: { value: "10" } };
    computeCalcFields(rows, record);
    expect(record.c).toEqual({ type: "CALC", value: "" });
  });

  test("空の NUMBER は 0 扱い", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("b", { type: "NUMBER" }),
      field("c", { type: "CALC", expression: "a + b" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {};
    computeCalcFields(rows, record);
    expect(record.c).toEqual({ type: "CALC", value: "0" });
  });

  test("除算精度", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("b", { type: "NUMBER" }),
      field("c", { type: "CALC", expression: "a / b" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {
      a: { value: "1" }, b: { value: "3" },
    };
    computeCalcFields(rows, record);
    expect(record.c).toEqual({ type: "CALC", value: "0.3333" });
  });

  test("Phase 2 範囲外の format は空文字列", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("c", { type: "CALC", expression: "a", format: "DATETIME" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { a: { value: "100" } };
    computeCalcFields(rows, record);
    expect(record.c).toEqual({ type: "CALC", value: "" });
  });

  test("Phase 2 範囲外の式（関数呼び出し等）は空文字列", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("c", { type: "CALC", expression: "SUM(a)" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { a: { value: "10" } };
    computeCalcFields(rows, record);
    expect(record.c).toEqual({ type: "CALC", value: "" });
  });
});
