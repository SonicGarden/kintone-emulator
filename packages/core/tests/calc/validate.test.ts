import { describe, expect, test } from "vitest";
import type { CalcNode } from "../../src/calc/ast";
import { CalcParseError } from "../../src/calc/errors";
import { parseExpression } from "../../src/calc/parser";
import {
  buildFieldIndex,
  detectCircularReferences,
  validateCalcField,
  type FieldLike,
} from "../../src/calc/validate";

const fields = (arr: FieldLike[]) => buildFieldIndex(arr);

describe("calc validator", () => {
  test("未定義フィールドコード", () => {
    const idx = fields([{ code: "a", type: "NUMBER" }]);
    const e = grab(() => validateCalcField({ code: "c", type: "CALC", expression: "a + b" }, idx));
    expect(e.kind).toBe("unknown_field");
    expect(e.message).toContain("（b）");
  });

  test("未知の関数", () => {
    const idx = fields([{ code: "a", type: "NUMBER" }]);
    const e = grab(() => validateCalcField({ code: "c", type: "CALC", expression: "FOOBAR(a)" }, idx));
    expect(e.kind).toBe("unknown_function");
    expect(e.message).toBe("FOOBAR関数は使用できません。");
  });

  test("IF の引数数 (3 固定)", () => {
    const idx = fields([{ code: "a", type: "NUMBER" }]);
    expect(grab(() => validateCalcField({ code: "c", type: "CALC", expression: "IF(a)" }, idx)).kind).toBe("arg_count");
    expect(grab(() => validateCalcField({ code: "c", type: "CALC", expression: "IF(a, 1, 2, 3)" }, idx)).kind).toBe("arg_count_max");
  });

  test("AND 引数上限 32", () => {
    const args = Array.from({ length: 33 }, () => "1").join(",");
    const idx = fields([]);
    const e = grab(() => validateCalcField({ code: "c", type: "CALC", expression: `AND(${args})` }, idx));
    expect(e.kind).toBe("arg_count_max");
    expect(e.message).toBe("AND関数に指定できる引数は32個までです。");
  });

  test("参照不可フィールドタイプ", () => {
    const idx = fields([
      { code: "ml", type: "MULTI_LINE_TEXT" },
    ]);
    const e = grab(() => validateCalcField({ code: "c", type: "CALC", expression: "ml + 1" }, idx));
    expect(e.kind).toBe("non_referenceable_field");
    expect(e.message).toContain("文字列（複数行）");
  });

  test("SUBTABLE 内フィールドは SUM 引数に使える", () => {
    const idx = fields([
      {
        code: "items", type: "SUBTABLE",
        fields: { qty: { code: "qty", type: "NUMBER" } },
      },
    ]);
    expect(() =>
      validateCalcField({ code: "c", type: "CALC", expression: "SUM(qty)" }, idx),
    ).not.toThrow();
  });

  test("CALC から CALC 参照は OK", () => {
    const idx = fields([
      { code: "a", type: "NUMBER" },
      { code: "x", type: "CALC" },
    ]);
    expect(() =>
      validateCalcField({ code: "y", type: "CALC", expression: "x + 1" }, idx),
    ).not.toThrow();
  });
});

describe("detectCircularReferences", () => {
  test("直接循環", () => {
    const a = parseExpression("b + 1");
    const b = parseExpression("a + 1");
    const asts = new Map<string, CalcNode>([["a", a], ["b", b]]);
    const e = grab(() => detectCircularReferences(asts));
    expect(e.kind).toBe("circular");
    expect(e.message).toBe("フィールドの参照が循環しています。");
  });

  test("間接循環", () => {
    const a = parseExpression("b + 1");
    const b = parseExpression("c + 1");
    const c = parseExpression("a + 1");
    const asts = new Map<string, CalcNode>([["a", a], ["b", b], ["c", c]]);
    expect(grab(() => detectCircularReferences(asts)).kind).toBe("circular");
  });

  test("循環なし", () => {
    const a = parseExpression("10");
    const b = parseExpression("a + 1");
    const c = parseExpression("b * 2");
    const asts = new Map<string, CalcNode>([["a", a], ["b", b], ["c", c]]);
    expect(() => detectCircularReferences(asts)).not.toThrow();
  });
});

const grab = (fn: () => unknown): CalcParseError => {
  try { fn(); } catch (e) { return e as CalcParseError; }
  throw new Error("expected to throw");
};
