import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeEach, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

// レコード取得 API は、app の properties に定義されているフィールドのうち
// レコードに値が保存されていないものも、フィールドタイプ別の空値で補完して返す（実 kintone 準拠）。
describeDualMode("レコード取得: 未入力フィールドのタイプ別空値補完", () => {
  const SESSION = "record-empty-fields";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "empty fields",
      properties: {
        str:   { type: "SINGLE_LINE_TEXT", code: "str",   label: "str" },
        multi: { type: "MULTI_LINE_TEXT",  code: "multi", label: "multi" },
        num:   { type: "NUMBER",           code: "num",   label: "num" },
        link:  { type: "LINK",             code: "link",  label: "link", protocol: "WEB" },
        dd:    { type: "DROP_DOWN",        code: "dd",    label: "dd",
                 options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        date:  { type: "DATE",             code: "date",  label: "date" },
        time:  { type: "TIME",             code: "time",  label: "time" },
        dt:    { type: "DATETIME",         code: "dt",    label: "dt" },
        check: { type: "CHECK_BOX",        code: "check", label: "check",
                 options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        ms:    { type: "MULTI_SELECT",     code: "ms",    label: "ms",
                 options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        file:  { type: "FILE",             code: "file",  label: "file" },
        users: { type: "USER_SELECT",      code: "users", label: "users" },
        sub:   { type: "SUBTABLE",         code: "sub",   label: "sub",
                 fields: { inner: { type: "SINGLE_LINE_TEXT", code: "inner", label: "inner" } } },
      },
    }));
  });

  const expectAllEmpty = (record: Record<string, { type?: string; value?: unknown }>) => {
    // 文字列系 → ""
    expect(record.str).toEqual({ type: "SINGLE_LINE_TEXT", value: "" });
    expect(record.multi).toEqual({ type: "MULTI_LINE_TEXT", value: "" });
    expect(record.num).toEqual({ type: "NUMBER", value: "" });
    expect(record.link).toEqual({ type: "LINK", value: "" });
    // null 系 → null（DATE / TIME）
    expect(record.dd).toEqual({ type: "DROP_DOWN", value: null });
    expect(record.date).toEqual({ type: "DATE", value: null });
    expect(record.time).toEqual({ type: "TIME", value: null });
    // DATETIME は実 kintone では "" を返す（DATE / TIME の null とは異なる）
    expect(record.dt).toEqual({ type: "DATETIME", value: "" });
    // 配列系 → []
    expect(record.check).toEqual({ type: "CHECK_BOX", value: [] });
    expect(record.ms).toEqual({ type: "MULTI_SELECT", value: [] });
    expect(record.file).toEqual({ type: "FILE", value: [] });
    expect(record.users).toEqual({ type: "USER_SELECT", value: [] });
    expect(record.sub).toEqual({ type: "SUBTABLE", value: [] });
  };

  test("getRecord: 空レコードでも全フィールドが空値で返る", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: {} });
    const { record } = await client.record.getRecord({ app: appId, id });
    expectAllEmpty(record as Record<string, { type?: string; value?: unknown }>);
  });

  test("getRecords: 空レコードでも全フィールドが空値で返る", async () => {
    await client.record.addRecord({ app: appId, record: {} });
    const { records } = await client.record.getRecords({ app: appId });
    expect(records).toHaveLength(1);
    expectAllEmpty(records[0] as Record<string, { type?: string; value?: unknown }>);
  });

  test("値を入れたフィールドはその値、未入力フィールドのみ空値で補完される", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { str: { value: "hello" }, num: { value: "42" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.str).toEqual({ type: "SINGLE_LINE_TEXT", value: "hello" });
    expect(record.num).toEqual({ type: "NUMBER", value: "42" });
    // 未入力は空値
    expect(record.link).toEqual({ type: "LINK", value: "" });
    expect(record.date).toEqual({ type: "DATE", value: null });
    expect(record.check).toEqual({ type: "CHECK_BOX", value: [] });
    expect(record.sub).toEqual({ type: "SUBTABLE", value: [] });
  });
});
