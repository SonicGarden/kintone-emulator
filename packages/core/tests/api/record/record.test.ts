import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("record-test-session");
});

describe("アプリのレコードAPI", () => {
  let client: KintoneRestAPIClient | undefined = undefined;
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: {
        apiToken: "test",
      },
    });
    await client.app.addFormFields({
      app: 1,
      properties: {
        test: {
          type: "SINGLE_LINE_TEXT",
          code: "test",
          label: "Test",
        },
      },
    });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("アプリにレコードを追加し、変更し、検索できる", async () => {
    const result = await client!.record.addRecord({
      app: 1,
      record: {
        test: {
          value: "test",
        },
      },
    });
    expect(result).toEqual({
      id: expect.any(String),
      revision: "1",
    });
    const record = await client!.record.getRecord({
      app: 1,
      id: result.id,
    });
    expect(record).toEqual({
      record: {
        $id: {
          value: result.id,
          type: "RECORD_NUMBER",
        },
        $revision: {
          value: "1",
          type: "__REVISION__",
        },
        test: {
          value: "test",
          type: "SINGLE_LINE_TEXT",
        },
      },
    });
    await client!.record.updateRecord({
      app: 1,
      id: result.id,
      record: {
        test: {
          value: "test2",
        },
      },
    });
    const updatedRecord = await client!.record.getRecord({
      app: 1,
      id: result.id,
    });
    expect(updatedRecord).toEqual({
      record: {
        $id: {
          value: result.id,
          type: "RECORD_NUMBER",
        },
        $revision: {
          value: "2",
          type: "__REVISION__",
        },
        test: {
          value: "test2",
          type: "SINGLE_LINE_TEXT",
        },
      },
    });
  });

  test("存在しないレコードをGETすると404が返る", async () => {
    // KintoneRestAPIClient は 4xx でエラーをthrowするため、ステータスコードを直接検証するために fetch を使用する
    const response = await fetch(`${BASE_URL}/k/v1/record.json?app=1&id=99999`);
    expect(response.status).toBe(404);
  });

  test("存在しないレコードをPUTすると404が返る", async () => {
    // KintoneRestAPIClient は 4xx でエラーをthrowするため、ステータスコードを直接検証するために fetch を使用する
    const response = await fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: 1,
        id: "99999",
        record: { test: { value: "test" } },
      }),
    });
    expect(response.status).toBe(404);
  });

  test("setup/app.json の records でレコードを一括作成できる", async () => {
    const appId = await createApp(BASE_URL, {
      name: "レコード付きアプリ",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      records: [
        { title: { value: "レコード1" } },
        { title: { value: "レコード2" } },
      ],
    });

    const records = await client!.record.getRecords({ app: appId, query: "order by $id asc" });
    expect(records.records).toHaveLength(2);
    expect(records.records[0]!.title).toEqual({ value: "レコード1", type: "SINGLE_LINE_TEXT" });
    expect(records.records[1]!.title).toEqual({ value: "レコード2", type: "SINGLE_LINE_TEXT" });
  });

  test("setup/app.json の records で $id を指定するとレコード ID が維持される", async () => {
    const appId = await createApp(BASE_URL, {
      name: "ID指定レコードアプリ",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      records: [
        { $id: { value: "100" }, title: { value: "レコード100" } },
        { $id: { value: "200" }, title: { value: "レコード200" } },
      ],
    });

    const record100 = await client!.record.getRecord({ app: appId, id: 100 });
    expect(record100.record.$id).toEqual({ value: "100", type: "RECORD_NUMBER" });
    expect(record100.record.title).toEqual({ value: "レコード100", type: "SINGLE_LINE_TEXT" });

    const record200 = await client!.record.getRecord({ app: appId, id: 200 });
    expect(record200.record.$id).toEqual({ value: "200", type: "RECORD_NUMBER" });
    expect(record200.record.title).toEqual({ value: "レコード200", type: "SINGLE_LINE_TEXT" });
  });

  test("records で重複する $id を指定するとエラーが返る", async () => {
    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "重複レコードIDアプリ",
        records: [
          { $id: { value: "100" }, title: { value: "レコード100" } },
          { $id: { value: "100" }, title: { value: "重複レコード" } },
        ],
      }),
    });
    expect(response.status).toBe(400);
  });

  test("異なるアプリのレコード ID はそれぞれ1から始まる", async () => {
    const app1 = await createApp(BASE_URL, {
      name: "アプリ1",
      properties: { field1: { type: "SINGLE_LINE_TEXT", code: "field1", label: "フィールド1" } },
    });
    const app2 = await createApp(BASE_URL, {
      name: "アプリ2",
      properties: { field2: { type: "SINGLE_LINE_TEXT", code: "field2", label: "フィールド2" } },
    });

    const result1 = await client!.record.addRecord({
      app: app1,
      record: { field1: { value: "アプリ1のレコード" } },
    });
    const result2 = await client!.record.addRecord({
      app: app2,
      record: { field2: { value: "アプリ2のレコード" } },
    });

    expect(result1.id).toBe("1");
    expect(result2.id).toBe("1");

    // 各アプリのレコードが独立して取得できることを検証
    const record1 = await client!.record.getRecord({ app: app1, id: 1 });
    expect(record1.record.field1).toEqual({ value: "アプリ1のレコード", type: "SINGLE_LINE_TEXT" });

    const record2 = await client!.record.getRecord({ app: app2, id: 1 });
    expect(record2.record.field2).toEqual({ value: "アプリ2のレコード", type: "SINGLE_LINE_TEXT" });
  });

  test("削除されたレコードの ID は再利用されない", async () => {
    const result1 = await client!.record.addRecord({
      app: 1,
      record: { test: { value: "first" } },
    });
    expect(result1.id).toBe("1");

    await client!.record.deleteRecords({ app: 1, ids: [result1.id] });

    const result2 = await client!.record.addRecord({
      app: 1,
      record: { test: { value: "second" } },
    });
    expect(result2.id).toBe("2");
  });

  test("日本語のフィールドを持つキーで更新をかける", async () => {
    const result = await client!.record.addRecord({
      app: 1,
      record: {
        レコード番号: {
          value: "test",
        },
        内容: {
          value: "test",
        },
      },
    });
    await client!.record.updateRecord({
      app: 1,
      updateKey: { field: "レコード番号", value: "test" },
      record: {
        内容: {
          value: "test2",
        },
      },
    });
    const updatedRecord = await client!.record.getRecord({
      app: 1,
      id: result.id,
    });
    expect(updatedRecord).toEqual({
      record: {
        $id: {
          value: result.id,
          type: "RECORD_NUMBER",
        },
        $revision: {
          value: "2",
          type: "__REVISION__",
        },
        レコード番号: {
          value: "test",
        },
        内容: {
          value: "test2",
        },
      },
    });
  });
});
