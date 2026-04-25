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

  test("関数呼び出しが評価される", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("c", { type: "CALC", expression: "ROUND(a / 3, 2)" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { a: { value: "10" } };
    computeCalcFields(rows, record);
    expect(record.c).toEqual({ type: "CALC", value: "3.33" });
  });

  test("SUBTABLE 内 NUMBER の SUM が動く", () => {
    const rows = [
      field("items", {
        type: "SUBTABLE",
        fields: { qty: { type: "NUMBER", code: "qty" } },
      }),
      field("total", { type: "CALC", expression: "SUM(qty)" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {
      items: { value: [
        { value: { qty: { value: "10" } } },
        { value: { qty: { value: "20" } } },
        { value: { qty: { value: "" } } },
      ] },
    };
    computeCalcFields(rows, record);
    expect(record.total).toEqual({ type: "CALC", value: "30" });
  });

  test("DATE 加算 (format=DATE)", () => {
    const rows = [
      field("d", { type: "DATE" }),
      field("plus", { type: "CALC", expression: "d + 86400", format: "DATE" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { d: { value: "2026-04-25" } };
    computeCalcFields(rows, record);
    expect(record.plus).toEqual({ type: "CALC", value: "2026-04-26" });
  });

  test("DATETIME 加算 (format=DATETIME)", () => {
    const rows = [
      field("dt", { type: "DATETIME" }),
      field("plus", { type: "CALC", expression: "dt + 3600", format: "DATETIME" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {
      dt: { value: "2026-04-25T10:00:00Z" },
    };
    computeCalcFields(rows, record);
    expect(record.plus).toEqual({ type: "CALC", value: "2026-04-25T11:00:00Z" });
  });

  test("DATETIME - DATE は秒数の差 (format=NUMBER)", () => {
    const rows = [
      field("d",  { type: "DATE" }),
      field("dt", { type: "DATETIME" }),
      field("diff", { type: "CALC", expression: "dt - d" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {
      d:  { value: "2026-04-25" },
      dt: { value: "2026-04-25T10:00:00Z" },
    };
    computeCalcFields(rows, record);
    expect(record.diff).toEqual({ type: "CALC", value: "36000" });
  });

  test("HOUR_MINUTE フォーマット (秒 → HH:MM, 24h 超え可)", () => {
    const rows = [
      field("n", { type: "NUMBER" }),
      field("hm", { type: "CALC", expression: "n", format: "HOUR_MINUTE" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { n: { value: "90061" } };
    computeCalcFields(rows, record);
    expect(record.hm).toEqual({ type: "CALC", value: "25:01" });
  });

  test("SINGLE_LINE_TEXT の expression は文字列として保存される", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("tc", { type: "SINGLE_LINE_TEXT", expression: '"x=" & a' }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { a: { value: "5" } };
    computeCalcFields(rows, record);
    expect(record.tc).toEqual({ type: "SINGLE_LINE_TEXT", value: "x=5" });
  });

  test("CALC で文字列を返す式は空文字列 (format=NUMBER)", () => {
    const rows = [
      field("a", { type: "NUMBER" }),
      field("c", { type: "CALC", expression: 'IF(a > 0, "pos", "neg")' }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { a: { value: "1" } };
    computeCalcFields(rows, record);
    expect(record.c).toEqual({ type: "CALC", value: "" });
  });

  test("CHECK_BOX を CONTAINS で参照", () => {
    const rows = [
      field("tags", { type: "CHECK_BOX" }),
      field("has_x", { type: "CALC", expression: 'CONTAINS(tags, "x")' }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {
      tags: { value: ["x", "y"] },
    };
    computeCalcFields(rows, record);
    expect(record.has_x).toEqual({ type: "CALC", value: "1" });
  });

  test("CONTAINS は DROP_DOWN 等の単一値には不適合 → 空文字列", () => {
    const rows = [
      field("status", { type: "DROP_DOWN" }),
      field("is_open", { type: "CALC", expression: 'CONTAINS(status, "OPEN")' }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {
      status: { value: "OPEN" },
    };
    computeCalcFields(rows, record);
    expect(record.is_open).toEqual({ type: "CALC", value: "" });
  });

  test("CREATED_TIME / UPDATED_TIME を meta から取得", () => {
    const rows = [
      field("created", { type: "CREATED_TIME" }),
      field("updated", { type: "UPDATED_TIME" }),
      field("c", { type: "CALC", expression: "updated - created" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = {};
    computeCalcFields(rows, record, {
      createdAt: "2026-04-25T10:00:00Z",
      updatedAt: "2026-04-25T11:00:00Z",
    });
    expect(record.c).toEqual({ type: "CALC", value: "3600" });
  });

  test("TIME フォーマット (mod 86400)", () => {
    const rows = [
      field("n", { type: "NUMBER" }),
      field("t", { type: "CALC", expression: "n", format: "TIME" }),
    ];
    const record: Record<string, { value: unknown; type?: string }> = { n: { value: "90061" } };
    computeCalcFields(rows, record);
    expect(record.t).toEqual({ type: "CALC", value: "01:01" });
  });
});
