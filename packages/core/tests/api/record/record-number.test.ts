import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeEach, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

describeDualMode("SUBTABLE 内 NUMBER の正規化 / 非数値の扱い", () => {
  const SESSION = "record-subtable-num";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "subtable number normalize",
      properties: {
        items: {
          type: "SUBTABLE", code: "items", label: "items",
          fields: {
            qty: { type: "NUMBER", code: "qty", label: "qty" },
          },
        },
      },
    }));
  });

  const addRow = async (qtyValue: unknown) => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { items: { value: [{ value: { qty: { value: qtyValue as string } } }] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const row = (record.items!.value as unknown as Array<{ value: { qty: { value: unknown } } }>)[0]!;
    return row.value.qty.value;
  };

  test("数値として解釈可能な文字列は正規化して保存（指数表記）", async () => {
    expect(await addRow("1.5e1")).toBe("15");
  });

  test("前後空白は無視されて保存", async () => {
    expect(await addRow(" 42 ")).toBe("42");
  });

  test("非数値 'abc' は空文字列として保存", async () => {
    expect(await addRow("abc")).toBe("");
  });

  test("カンマ区切り '1,000' は空文字列として保存", async () => {
    expect(await addRow("1,000")).toBe("");
  });

  test("先頭数値混在 '12abc' は空文字列として保存", async () => {
    expect(await addRow("12abc")).toBe("");
  });

  test("空文字列はそのまま空文字列", async () => {
    expect(await addRow("")).toBe("");
  });
});

describeDualMode("top-level NUMBER の正規化", () => {
  const SESSION = "record-top-num";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "top number normalize",
      properties: {
        n: { type: "NUMBER", code: "n", label: "n" },
      },
    }));
  });

  const addAndGet = async (input: unknown) => {
    const { id } = await client.record.addRecord({
      app: appId, record: { n: { value: input as string } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    return record.n!.value;
  };

  test("指数表記は整数文字列に正規化される（\"1.5e1\" → \"15\"）", async () => {
    expect(await addAndGet("1.5e1")).toBe("15");
  });

  test("前後空白は取り除かれる（\" 42 \" → \"42\"）", async () => {
    expect(await addAndGet(" 42 ")).toBe("42");
  });

  test("整数はそのまま保存（\"100\" → \"100\"）", async () => {
    expect(await addAndGet("100")).toBe("100");
  });

  test("非数値は 400 エラー（SUBTABLE 内と違い top-level は拒否）", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { n: { value: "abc" } } }),
    ).rejects.toMatchObject({
      errors: { "record[n].value": { messages: ["数字でなければなりません。"] } },
    });
  });
});

