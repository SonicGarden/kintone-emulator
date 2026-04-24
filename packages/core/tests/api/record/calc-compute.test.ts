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
