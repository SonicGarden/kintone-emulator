import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("layout-test-session");
});

describeEmulatorOnly("フォームレイアウト取得API", () => {
  beforeEach(async () => {
    await initializeSession(BASE_URL);
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("layout なしでアプリを作成すると layout が空配列で返る", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const appId = (await createApp(BASE_URL, { name: "レイアウトなしアプリ" })).appId;

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

    const appId = (await createApp(BASE_URL, { name: "レイアウトありアプリ", layout })).appId;

    const layoutResult = await client.app.getFormLayout({ app: appId });
    expect(layoutResult.layout).toEqual(layout);
    expect(layoutResult.revision).toEqual(expect.any(String));
  });

  test("存在しないアプリのフォームレイアウトをGETすると GAIA_AP01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/app/form/layout.json?app=99999`);
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.code).toBe("GAIA_AP01");
  });
});
