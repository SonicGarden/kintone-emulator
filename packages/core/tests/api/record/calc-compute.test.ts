// CALC フィールドの計算結果がレコード書き込み時に評価されることを確認する。
// Phase 2: 数値演算 + NUMBER / CALC 参照のみ。
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeEach, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

describeDualMode("CALC フィールドの計算（数値）", () => {
  const SESSION = "calc-compute-session";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "calc compute",
      properties: {
        a: { type: "NUMBER", code: "a", label: "a" },
        b: { type: "NUMBER", code: "b", label: "b" },
        calc_add: { type: "CALC", code: "calc_add", label: "add", expression: "a + b", format: "NUMBER" },
        calc_sub: { type: "CALC", code: "calc_sub", label: "sub", expression: "a - b", format: "NUMBER" },
        calc_mul: { type: "CALC", code: "calc_mul", label: "mul", expression: "a * b", format: "NUMBER" },
        calc_div: { type: "CALC", code: "calc_div", label: "div", expression: "a / b", format: "NUMBER" },
        calc_pow: { type: "CALC", code: "calc_pow", label: "pow", expression: "a ^ b", format: "NUMBER" },
      },
    }));
  });

  test("四則演算の結果が返る", async () => {
    const { id } = await client.record.addRecord({
      app: appId, record: { a: { value: "10" }, b: { value: "3" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_add).toEqual({ type: "CALC", value: "13" });
    expect(record.calc_sub).toEqual({ type: "CALC", value: "7" });
    expect(record.calc_mul).toEqual({ type: "CALC", value: "30" });
    expect(record.calc_div).toEqual({ type: "CALC", value: "3.3333" });
    expect(record.calc_pow).toEqual({ type: "CALC", value: "1000" });
  });

  test("0 除算は空文字列", async () => {
    const { id } = await client.record.addRecord({
      app: appId, record: { a: { value: "10" }, b: { value: "0" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_div).toEqual({ type: "CALC", value: "" });
  });

  test("空 / 欠損の NUMBER は 0 扱い", async () => {
    const { id } = await client.record.addRecord({
      app: appId, record: { a: { value: "5" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_add).toEqual({ type: "CALC", value: "5" });
  });

  test("レコード更新で CALC 値も再計算される", async () => {
    const { id } = await client.record.addRecord({
      app: appId, record: { a: { value: "10" }, b: { value: "3" } },
    });
    await client.record.updateRecord({
      app: appId, id, record: { a: { value: "20" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_add).toEqual({ type: "CALC", value: "23" });
  });
});

describeDualMode("CALC フィールド: 比較・論理・条件分岐", () => {
  const SESSION = "calc-bool-session";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "calc bool",
      properties: {
        a: { type: "NUMBER", code: "a", label: "a" },
        calc_cmp: { type: "CALC", code: "calc_cmp", label: "cmp", expression: "a > 10", format: "NUMBER" },
        calc_and: { type: "CALC", code: "calc_and", label: "and", expression: "AND(a > 0, a < 100)", format: "NUMBER" },
        calc_if:  { type: "CALC", code: "calc_if",  label: "if",  expression: "IF(a > 10, a * 2, a / 2)", format: "NUMBER" },
      },
    }));
  });

  test("比較演算子は 0 / 1 で返る", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { a: { value: "50" } } });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_cmp).toEqual({ type: "CALC", value: "1" });
    expect(record.calc_and).toEqual({ type: "CALC", value: "1" });
  });

  test("AND は片方 false で 0", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { a: { value: "200" } } });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_and).toEqual({ type: "CALC", value: "0" });
  });

  test("IF の数値分岐", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { a: { value: "15" } } });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_if).toEqual({ type: "CALC", value: "30" });
  });
});

describeDualMode("CALC フィールド: ROUND 系・SUM(SUBTABLE)", () => {
  const SESSION = "calc-round-sum-session";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "calc round/sum",
      properties: {
        n: { type: "NUMBER", code: "n", label: "n" },
        calc_round:   { type: "CALC", code: "calc_round",   label: "r",  expression: "ROUND(n, 2)",     format: "NUMBER" },
        calc_roundup: { type: "CALC", code: "calc_roundup", label: "ru", expression: "ROUNDUP(n, 2)",   format: "NUMBER" },
        calc_rdown:   { type: "CALC", code: "calc_rdown",   label: "rd", expression: "ROUNDDOWN(n, 2)", format: "NUMBER" },
        items: {
          type: "SUBTABLE", code: "items", label: "items",
          fields: { qty: { type: "NUMBER", code: "qty", label: "qty" } },
        },
        calc_sum: { type: "CALC", code: "calc_sum", label: "s", expression: "SUM(qty)", format: "NUMBER" },
      },
    }));
  });

  test("ROUND / ROUNDUP / ROUNDDOWN", async () => {
    const { id } = await client.record.addRecord({
      app: appId, record: { n: { value: "3.14159" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_round).toEqual({ type: "CALC", value: "3.14" });
    expect(record.calc_roundup).toEqual({ type: "CALC", value: "3.15" });
    expect(record.calc_rdown).toEqual({ type: "CALC", value: "3.14" });
  });

  test("SUM(SUBTABLE 内 NUMBER)", async () => {
    const { id } = await client.record.addRecord({
      app: appId, record: {
        items: { value: [
          { value: { qty: { value: "10" } } },
          { value: { qty: { value: "20" } } },
          { value: { qty: { value: "" } } },
        ] },
      },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_sum).toEqual({ type: "CALC", value: "30" });
  });
});

describeDualMode("CALC フィールド: 日付演算とフォーマット", () => {
  const SESSION = "calc-date-session";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "calc date",
      properties: {
        d:  { type: "DATE",     code: "d",  label: "d" },
        dt: { type: "DATETIME", code: "dt", label: "dt" },
        n:  { type: "NUMBER",   code: "n",  label: "n" },
        calc_d_plus:  { type: "CALC", code: "calc_d_plus",  label: "dp",  expression: "d + 86400",  format: "DATE" },
        calc_dt_plus: { type: "CALC", code: "calc_dt_plus", label: "dtp", expression: "dt + 3600",  format: "DATETIME" },
        calc_diff:    { type: "CALC", code: "calc_diff",    label: "df",  expression: "dt - d",     format: "NUMBER" },
        calc_hm:      { type: "CALC", code: "calc_hm",      label: "hm",  expression: "n",          format: "HOUR_MINUTE" },
        calc_time:    { type: "CALC", code: "calc_time",    label: "t",   expression: "n",          format: "TIME" },
      },
    }));
  });

  test("DATE + 86400 = 翌日", async () => {
    const { id } = await client.record.addRecord({
      app: appId, record: {
        d: { value: "2026-04-25" },
        dt: { value: "2026-04-25T10:00:00Z" },
        n: { value: "90061" },
      },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_d_plus).toEqual({ type: "CALC", value: "2026-04-26" });
    expect(record.calc_dt_plus).toEqual({ type: "CALC", value: "2026-04-25T11:00:00Z" });
    expect(record.calc_diff).toEqual({ type: "CALC", value: "36000" });
    expect(record.calc_hm).toEqual({ type: "CALC", value: "25:01" });
    expect(record.calc_time).toEqual({ type: "CALC", value: "01:01" });
  });
});

describeDualMode("CALC フィールドが別 CALC を参照", () => {
  const SESSION = "calc-nested-session";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "calc nested",
      properties: {
        a: { type: "NUMBER", code: "a", label: "a" },
        calc_x: { type: "CALC", code: "calc_x", label: "x", expression: "a * 2", format: "NUMBER" },
        calc_y: { type: "CALC", code: "calc_y", label: "y", expression: "calc_x + 1", format: "NUMBER" },
      },
    }));
  });

  test("依存順で評価される", async () => {
    const { id } = await client.record.addRecord({
      app: appId, record: { a: { value: "10" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.calc_x).toEqual({ type: "CALC", value: "20" });
    expect(record.calc_y).toEqual({ type: "CALC", value: "21" });
  });
});
