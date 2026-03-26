import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("app-test-session");
});

describe("アプリ作成API", () => {
  beforeEach(async () => {
    await initializeSession(BASE_URL);
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("アプリを作成するとIDとrevisionが返る", async () => {
    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "テストアプリ" }),
    });
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.app).toEqual(expect.any(String));
    expect(data.revision).toBe("1");
  });

  test("複数回作成するとIDがインクリメントされる", async () => {
    const id1 = await createApp(BASE_URL, { name: "アプリ1" });
    const id2 = await createApp(BASE_URL, { name: "アプリ2" });

    expect(id2).toBeGreaterThan(id1);
  });

  test("ID を指定してアプリを作成するとそのIDが使われる", async () => {
    const appId = await createApp(BASE_URL, { id: 42, name: "ID指定アプリ" });
    expect(appId).toBe(42);

    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });
    const result = await client.app.getApp({ id: 42 });
    expect(result.appId).toBe("42");
    expect(result.name).toBe("ID指定アプリ");
  });

  test("重複するIDを指定するとエラーが返る", async () => {
    await createApp(BASE_URL, { id: 42, name: "最初のアプリ" });

    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 42, name: "重複アプリ" }),
    });
    expect(response.status).toBe(400);
  });

  test("properties 付きでアプリを作成するとフィールドが登録される", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const appId = await createApp(BASE_URL, {
      name: "フィールド付きアプリ",
      properties: {
        text_field: {
          type: "SINGLE_LINE_TEXT",
          label: "テキスト",
        },
      },
    });

    const formResult = await client.app.getFormFields({ app: appId });
    expect(formResult.properties).toHaveProperty("text_field");
    expect(formResult.properties.text_field).toMatchObject({
      type: "SINGLE_LINE_TEXT",
      code: "text_field",
      label: "テキスト",
    });
  });

  test("properties なしでアプリを作成するとフィールドは空", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const appId = await createApp(BASE_URL, { name: "フィールドなしアプリ" });

    const formResult = await client.app.getFormFields({ app: appId });
    expect(formResult.properties).toEqual({});
  });

  test("複数フィールドを一度に登録できる", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const appId = await createApp(BASE_URL, {
      name: "複数フィールドアプリ",
      properties: {
        field1: {
          type: "SINGLE_LINE_TEXT",
          label: "フィールド1",
        },
        field2: {
          type: "NUMBER",
          label: "フィールド2",
        },
      },
    });

    const formResult = await client.app.getFormFields({ app: appId });
    expect(formResult.properties).toHaveProperty("field1");
    expect(formResult.properties).toHaveProperty("field2");
  });
});

describe("アプリ情報取得API", () => {
  let client: KintoneRestAPIClient;
  beforeAll(() => {
    client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });
  });

  beforeEach(async () => {
    await initializeSession(BASE_URL);
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("作成したアプリを1件取得できる", async () => {
    const appIdNum = await createApp(BASE_URL, { name: "取得テストアプリ" });
    const appId = String(appIdNum);

    const result = await client.app.getApp({ id: appIdNum });
    expect(result).toMatchObject({
      appId,
      name: "取得テストアプリ",
      code: "",
      description: "",
      spaceId: null,
      threadId: null,
    });
    expect(result.createdAt).toBeDefined();
    expect(result.modifiedAt).toBeDefined();
  });

  test("存在しないアプリを取得すると404が返る", async () => {
    // KintoneRestAPIClient は 4xx でエラーをthrowするため、ステータスコードを直接検証するために fetch を使用する
    const response = await fetch(`${BASE_URL}/k/v1/app.json?id=99999`);
    expect(response.status).toBe(404);
  });

  test("複数アプリを一覧取得できる", async () => {
    for (const name of ["アプリA", "アプリB", "アプリC"]) {
      await createApp(BASE_URL, { name });
    }

    const result = await client.app.getApps({});
    expect(result.apps).toHaveLength(3);
    expect(result.apps.map((a) => a.name)).toEqual(
      expect.arrayContaining(["アプリA", "アプリB", "アプリC"])
    );
  });

  test("IDで絞り込んで取得できる", async () => {
    const id1 = await createApp(BASE_URL, { name: "アプリX" });
    await createApp(BASE_URL, { name: "アプリY" });

    const result = await client.app.getApps({ ids: [id1] });
    expect(result.apps).toHaveLength(1);
    expect(result.apps[0]!.name).toBe("アプリX");
  });

  test("名前で絞り込んで取得できる", async () => {
    for (const name of ["フィルタ対象", "フィルタ対象2", "別のアプリ"]) {
      await createApp(BASE_URL, { name });
    }

    const result = await client.app.getApps({ name: "フィルタ対象" });
    expect(result.apps).toHaveLength(2);
  });

  test("limitで取得件数を絞り込める", async () => {
    for (const name of ["アプリ1", "アプリ2", "アプリ3", "アプリ4", "アプリ5"]) {
      await createApp(BASE_URL, { name });
    }

    const result = await client.app.getApps({ limit: 3 });
    expect(result.apps).toHaveLength(3);
  });

  test("offsetでスキップできる", async () => {
    for (const name of ["アプリ1", "アプリ2", "アプリ3", "アプリ4", "アプリ5"]) {
      await createApp(BASE_URL, { name });
    }

    const all = await client.app.getApps({});
    expect(all.apps).toHaveLength(5);
    const result = await client.app.getApps({ offset: 2 });
    expect(result.apps).toHaveLength(3);
    expect(result.apps[0]!.appId).toBe(all.apps[2]!.appId);
  });
});
