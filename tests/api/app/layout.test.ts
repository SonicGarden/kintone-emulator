import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { host } from "tests/config";

const SESSION = "layout-test-session";
const BASE_URL = `http://${host}/${SESSION}`;

describe("フォームレイアウト取得API", () => {
  beforeEach(async () => {
    await fetch(`${BASE_URL}/initialize`, { method: "POST" });
  });

  afterEach(async () => {
    await fetch(`${BASE_URL}/finalize`, { method: "POST" });
  });

  test("layout なしでアプリを作成すると layout が空配列で返る", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "レイアウトなしアプリ" }),
    });
    const data = await response.json();
    const appId = Number(data.app);

    const layoutResult = await client.app.getFormLayout({ app: appId });
    expect(layoutResult.layout).toEqual([]);
    expect(layoutResult.revision).toEqual(expect.any(String));
  });

  test("layout ありでアプリを作成すると登録したレイアウトが返る", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const layout = [
      {
        type: "ROW",
        fields: [
          {
            type: "SINGLE_LINE_TEXT",
            code: "text_field",
            size: { width: "193" },
          },
        ],
      },
    ];

    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "レイアウトありアプリ",
        layout,
      }),
    });
    const data = await response.json();
    const appId = Number(data.app);

    const layoutResult = await client.app.getFormLayout({ app: appId });
    expect(layoutResult.layout).toEqual(layout);
    expect(layoutResult.revision).toEqual(expect.any(String));
  });

  test("存在しないアプリのフォームレイアウトをGETすると404が返る", async () => {
    // KintoneRestAPIClient は 4xx でエラーをthrowするため、ステータスコードを直接検証するために fetch を使用する
    const response = await fetch(`${BASE_URL}/k/v1/app/form/layout.json?app=99999`);
    expect(response.status).toBe(404);
  });
});
