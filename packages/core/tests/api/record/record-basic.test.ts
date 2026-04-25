import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { createTestApp, describeDualMode, describeEmulatorOnly, getTestClient, resetTestEnvironment } from "../../real-kintone";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("record-test-session");
});

describeDualMode("アプリのレコードAPI", () => {
  const SESSION = "record-basic";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "record basic",
      properties: {
        test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" },
      },
    }));
  });

  test("アプリにレコードを追加し、変更し、検索できる", async () => {
    const result = await client.record.addRecord({
      app: appId,
      record: { test: { value: "test" } },
    });
    expect(result).toMatchObject({ id: expect.any(String), revision: "1" });
    const record = await client.record.getRecord({ app: appId, id: result.id });
    expect(record.record.$id).toEqual({ value: result.id, type: "__ID__" });
    expect(record.record.$revision).toEqual({ value: "1", type: "__REVISION__" });
    expect(record.record.test).toEqual({ value: "test", type: "SINGLE_LINE_TEXT" });

    await client.record.updateRecord({
      app: appId, id: result.id, record: { test: { value: "test2" } },
    });
    const updatedRecord = await client.record.getRecord({ app: appId, id: result.id });
    expect(updatedRecord.record.$revision).toEqual({ value: "2", type: "__REVISION__" });
    expect(updatedRecord.record.test).toEqual({ value: "test2", type: "SINGLE_LINE_TEXT" });
  });

  test("存在しないレコードをGETすると GAIA_RE01 が返る", async () => {
    // KintoneRestAPIError.message は `[404] [GAIA_RE01] ...` 形式なので code だけチェック
    await expect(
      client.record.getRecord({ app: appId, id: 99999 }),
    ).rejects.toMatchObject({ code: "GAIA_RE01" });
  });

  test("存在しないレコードをPUTすると GAIA_RE01 が返る", async () => {
    await expect(
      client.record.updateRecord({
        app: appId, id: 99999, record: { test: { value: "test" } },
      }),
    ).rejects.toMatchObject({ code: "GAIA_RE01" });
  });

  test("setup（createTestApp / records 指定）でレコードを一括作成できる", async () => {
    const { appId: otherAppId } = await createTestApp(SESSION, {
      name: "レコード付きアプリ",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      records: [
        { title: { value: "レコード1" } },
        { title: { value: "レコード2" } },
      ],
    });
    const records = await client.record.getRecords({ app: otherAppId, query: "order by $id asc" });
    expect(records.records).toHaveLength(2);
    expect(records.records[0]!.title).toEqual({ value: "レコード1", type: "SINGLE_LINE_TEXT" });
    expect(records.records[1]!.title).toEqual({ value: "レコード2", type: "SINGLE_LINE_TEXT" });
  });
});

// 以下はエミュレーター固有の挙動（raw fetch / /setup/app.json / 逐次 ID / 未定義フィールドの許容など）
describeEmulatorOnly("アプリのレコードAPI（emulator 固有）", () => {
  let client: KintoneRestAPIClient | undefined = undefined;
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });
    await client.app.addFormFields({
      app: 1,
      properties: {
        test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" },
      },
    });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("パラメーター欠落（id）で CB_VA01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/record.json?app=1`);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors).toEqual({ id: { messages: ["必須です。"] } });
  });

  test("Accept-Language: en で英語の GAIA_RE01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/record.json?app=1&id=99999`, {
      headers: { "Accept-Language": "en" },
    });
    const json = await response.json();
    expect(json.message).toBe("The specified record (ID: 99999) is not found.");
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
    expect(record100.record.$id).toEqual({ value: "100", type: "__ID__" });
    expect(record100.record.title).toEqual({ value: "レコード100", type: "SINGLE_LINE_TEXT" });

    const record200 = await client!.record.getRecord({ app: appId, id: 200 });
    expect(record200.record.$id).toEqual({ value: "200", type: "__ID__" });
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
        レコード番号: { value: "test" },
        内容: { value: "test" },
      },
    });
    await client!.record.updateRecord({
      app: 1,
      updateKey: { field: "レコード番号", value: "test" },
      record: { 内容: { value: "test2" } },
    });
    const updatedRecord = await client!.record.getRecord({ app: 1, id: result.id });
    expect(updatedRecord.record.レコード番号).toMatchObject({ value: "test" });
    expect(updatedRecord.record.内容).toMatchObject({ value: "test2" });
  });
});
