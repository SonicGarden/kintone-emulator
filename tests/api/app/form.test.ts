import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "tests/helpers";

const BASE_URL = createBaseUrl("app-form-test-session");

describe("アプリのフォームフィールドAPI", () => {
  let appId: number;

  beforeEach(async () => {
    await initializeSession(BASE_URL);
    appId = await createApp(BASE_URL, { name: "テストアプリ" });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("アプリにフィールドを追加し、確認し、削除できる", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: {
        apiToken: "test",
      },
    });
    const result = await client.app.addFormFields({
      app: appId,
      properties: {
        test: {
          type: "SINGLE_LINE_TEXT",
          code: "test",
          label: "Test",
        },
      },
    });
    expect(result).toEqual({
      revision: "1",
    });
    const formResult = await client.app.getFormFields({
      app: appId,
    });
    expect(formResult.properties).toHaveProperty("test");
    expect(formResult.properties.test).toEqual({
      type: "SINGLE_LINE_TEXT",
      code: "test",
      label: "Test",
      noLabel: false,
    });
    await client.app.deleteFormFields({
      app: appId,
      fields: ["test"],
    });
    expect(await client.app.getFormFields({ app: appId })).toEqual({
      properties: {},
      revision: "1",
    });
  });

  test("追加属性（required, defaultValue）が保存・返却される", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: {
        apiToken: "test",
      },
    });
    await client.app.addFormFields({
      app: appId,
      properties: {
        rich_field: {
          type: "SINGLE_LINE_TEXT",
          code: "rich_field",
          label: "リッチフィールド",
          required: true,
          defaultValue: "デフォルト",
        },
      },
    });
    const result = await client.app.getFormFields({ app: appId });
    expect(result.properties.rich_field).toMatchObject({
      type: "SINGLE_LINE_TEXT",
      code: "rich_field",
      label: "リッチフィールド",
      required: true,
      defaultValue: "デフォルト",
    });
  });

  test("存在しないアプリのフォームフィールドをGETすると404が返る", async () => {
    // KintoneRestAPIClient は 4xx でエラーをthrowするため、ステータスコードを直接検証するために fetch を使用する
    const response = await fetch(`${BASE_URL}/k/v1/app/form/fields.json?app=99999`);
    expect(response.status).toBe(404);
  });
});
