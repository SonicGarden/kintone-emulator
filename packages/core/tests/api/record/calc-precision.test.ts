import { beforeAll, expect, test } from "vitest";
import type { NumberPrecision } from "../../../src/query/number";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

// 計算フィールドの未入力の扱い・数値精度による丸め・型の規則 (doc/kintone-calc-behavior.md)。
// 精度ごとに 1 つのアプリを作り、式 (CALC / SINGLE_LINE_TEXT の expression) → レコードごとの計算結果を表で検証する。
// 実 kintone は精度を変えるたびに deploy が要るので beforeAll で 1 度だけ作る

type Expectations = Record<string, { expression: string; text?: boolean; expected: Record<string, string> }>;

const setupCalcApp = async (
  session: string,
  cases: Expectations,
  records: Record<string, Record<string, unknown>>,
  numberPrecision?: NumberPrecision,
) => {
  await resetTestEnvironment(session);
  const client = getTestClient(session);
  const properties: Record<string, unknown> = {
    label: { type: "SINGLE_LINE_TEXT", code: "label", label: "label" },
    n: { type: "NUMBER", code: "n", label: "n" },
    m: { type: "NUMBER", code: "m", label: "m" },
    d: { type: "DATE", code: "d", label: "d" },
    items: {
      type: "SUBTABLE", code: "items", label: "items",
      fields: { qty: { type: "NUMBER", code: "qty", label: "qty" } },
    },
  };
  for (const [code, { expression, text }] of Object.entries(cases)) {
    properties[code] = text
      ? { type: "SINGLE_LINE_TEXT", code, label: code, expression }
      : { type: "CALC", code, label: code, expression, format: "NUMBER" };
  }
  const { appId } = await createTestApp(session, {
    name: "calc precision",
    properties,
    numberPrecision,
    records: Object.entries(records).map(([label, fields]) => ({ label: { value: label }, ...fields })),
  });
  const { records: got } = await client.record.getRecords({ app: appId });
  return new Map(got.map((r) => [r.label!.value as string, r as Record<string, { value: unknown }>]));
};

const defineCases = (cases: Expectations, getRecords: () => Map<string, Record<string, { value: unknown }>>) => {
  test.each(Object.entries(cases))("%s", (code, { expected }) => {
    const records = getRecords();
    const actual = Object.fromEntries(Object.keys(expected).map((label) => [label, records.get(label)![code]!.value]));
    expect(actual).toEqual(expected);
  });
};

describeDualMode("計算フィールド: 既定の数値精度 (16 桁 / 小数 4 桁 / HALF_EVEN)", () => {
  const records = {
    none: {},
    empty: { n: { value: "" }, d: { value: "" }, items: { value: [{ value: { qty: { value: "" } } }] } },
    n5: { n: { value: "5" }, items: { value: [{ value: { qty: { value: "1" } } }] } },
    big: { n: { value: "999999999999.9999" }, m: { value: "1" } },
    digits12: { n: { value: "999999999999" }, m: { value: "0.00025" } },
  };
  const cases: Expectations = {
    // 未入力: 単独参照なら ""、演算・比較・SUM では 0
    ref_n:      { expression: "n",               expected: { none: "", empty: "", n5: "5", big: "999999999999.9999" } },
    paren_n:    { expression: "(n)",             expected: { none: "", n5: "5" } },
    neg_n:      { expression: "-n",              expected: { none: "0", n5: "-5" } },
    n_plus_1:   { expression: "n + 1",           expected: { none: "1", empty: "1", n5: "6" } },
    sum_n:      { expression: "SUM(n)",          expected: { none: "0", n5: "5" } },
    n_eq_0:     { expression: "n = 0",           expected: { none: "1", n5: "0" } },
    if_cmp:     { expression: "IF(n > 0, 1, 2)", expected: { none: "2", n5: "1" } },
    // IF の分岐先は未入力のまま
    if_branch:  { expression: "IF(1 > 0, n, 2)", expected: { none: "", n5: "5" } },
    ref_ref_n:  { expression: "ref_n",           expected: { none: "", n5: "5", big: "999999999999.9999" } },
    ref_ref_n1: { expression: "ref_n + 1",       expected: { none: "1", n5: "6" } },
    ref_d:      { expression: "d",               expected: { none: "", empty: "" } },
    d_plus:     { expression: "d + 86400",       expected: { none: "86400", empty: "86400" } },
    // 行が無いテーブルの SUM はエラー。空の行は 0
    sum_qty:    { expression: "SUM(qty)",        expected: { none: "", empty: "0", n5: "1" } },
    sum_qty_1:  { expression: "SUM(qty) + 1",    expected: { none: "", empty: "1", n5: "2" } },

    // 桁数: リテラルと途中の値を 1 つずつ小数第 4 位に丸め、整数部が 12 桁を超えたら ""
    third:      { expression: "1 / 3",           expected: { none: "0.3333" } },
    third_x3:   { expression: "1 / 3 * 3",       expected: { none: "0.9999" } },
    literal:    { expression: "0.00015 * 10000", expected: { none: "2" } },
    literal2:   { expression: "0.00025 * 1",     expected: { none: "0.0002" } },
    overflow:   { expression: "999999999999 + 1", expected: { none: "" } },
    n_plus_1b:  { expression: "n + 1",           expected: { big: "", digits12: "" } },
    mid_over:   { expression: "n * 10 / 10",     expected: { n5: "5", digits12: "" } },
    n_plus_m:   { expression: "n + m",           expected: { digits12: "999999999999.0002" } },
    keep_16:    { expression: "n + 0",           expected: { big: "999999999999.9999" } },

    // 関数
    round:      { expression: "ROUND(-2.5, 0)",      expected: { none: "-3" } },
    round2:     { expression: "ROUND(1.25, 1)",      expected: { none: "1.3" } },
    roundup:    { expression: "ROUNDUP(-1.21, 1)",   expected: { none: "-1.3" } },
    rounddown:  { expression: "ROUNDDOWN(-1.29, 1)", expected: { none: "-1.2" } },

    // 型: IF の条件・AND の引数は真偽値、真偽値を算術に使うとエラー
    cmp:        { expression: "1 > 0",           expected: { none: "1" } },
    if_number:  { expression: "IF(1, 1, 2)",     expected: { none: "" } },
    and_number: { expression: "AND(1, 1)",       expected: { none: "" } },
    bool_plus:  { expression: "(1 > 0) + 1",     expected: { none: "" } },

    // 文字列の自動計算
    s_ref_n:    { expression: "n",               text: true, expected: { none: "", n5: "5" } },
    s_concat:   { expression: 'n & "x"',         text: true, expected: { none: "x", n5: "5x" } },
    s_bool:     { expression: '(1 > 0) & "x"',   text: true, expected: { none: "truex" } },
    s_third:    { expression: '1 / 3 & ""',      text: true, expected: { none: "0.3333" } },
    s_if_num:   { expression: 'IF(1, "a", "b")', text: true, expected: { none: "" } },
  };
  let got: Map<string, Record<string, { value: unknown }>>;
  beforeAll(async () => {
    got = await setupCalcApp("calc-precision-default", cases, records);
  }, 120_000);
  defineCases(cases, () => got);
});

describeDualMode("計算フィールド: 数値精度 30 桁 / 小数 10 桁", () => {
  const records = {
    none: {},
    big: { n: { value: "999999999999.9999" } },
    digits12: { n: { value: "999999999999" }, m: { value: "0.00025" } },
  };
  const cases: Expectations = {
    third:    { expression: "1 / 3",            expected: { none: "0.3333333333" } },
    div7:     { expression: "10 / 7",           expected: { none: "1.4285714286" } },
    literal:  { expression: "0.00015 * 10000",  expected: { none: "1.5" } },
    overflow: { expression: "999999999999 + 1", expected: { none: "1000000000000" } },
    n_plus_1: { expression: "n + 1",            expected: { big: "1000000000000.9999" } },
    n_plus_m: { expression: "n + m",            expected: { digits12: "999999999999.00025" } },
    pow:      { expression: "2 ^ -20",          expected: { none: "0.0000009537" } },
  };
  let got: Map<string, Record<string, { value: unknown }>>;
  beforeAll(async () => {
    got = await setupCalcApp(
      "calc-precision-30", cases, records, { digits: "30", decimalPlaces: "10", roundingMode: "HALF_EVEN" },
    );
  }, 120_000);
  defineCases(cases, () => got);
});

describeDualMode("計算フィールド: 数値精度 5 桁 / 小数 2 桁 / UP", () => {
  const records = { none: {}, small: { n: { value: "1.5" } } };
  const cases: Expectations = {
    third:      { expression: "1 / 3",         expected: { none: "0.34" } },
    third_x3:   { expression: "1 / 3 * 3",     expected: { none: "1.02" } },
    literal:    { expression: "0.00015 * 1",   expected: { none: "0.01" } },
    negative:   { expression: "-0.00001",      expected: { none: "-0.01" } },
    n_div:      { expression: "n / 3",         expected: { small: "0.5" } },
    // 整数部は 3 桁まで。リテラルの 10000 だけで超える
    literal_over: { expression: "0.01 * 10000", expected: { none: "" } },
    overflow:   { expression: "99999 + 1",     expected: { none: "" } },
    // べき乗は結果だけを丸める
    pow:        { expression: "2 ^ -20",       expected: { none: "0.01" } },
  };
  let got: Map<string, Record<string, { value: unknown }>>;
  beforeAll(async () => {
    got = await setupCalcApp(
      "calc-precision-5up", cases, records, { digits: "5", decimalPlaces: "2", roundingMode: "UP" },
    );
  }, 120_000);
  defineCases(cases, () => got);
});
