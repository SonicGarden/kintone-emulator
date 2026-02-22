import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { host } from "tests/config";

const SESSION = "app-form-test-session";
const BASE_URL = `http://${host}/${SESSION}`;

describe("アプリのフォームフィールドAPI", () => {
  beforeEach(async () => {
    await fetch(`${BASE_URL}/initialize`, {
      method: "POST",
    });
  });

  afterEach(async () => {
    await fetch(`${BASE_URL}/finalize`, {
      method: "POST",
    });
  });

  test("アプリにフィールドを追加し、確認し、削除できる", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: {
        apiToken: "test",
      },
    });
    const result = await client.app.addFormFields({
      app: 1,
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
      app: 1,
    });
    expect(formResult.properties).toHaveProperty("test");
    expect(formResult.properties.test).toEqual({
      type: "SINGLE_LINE_TEXT",
      code: "test",
      label: "Test",
      noLabel: false,
    });
    await client.app.deleteFormFields({
      app: 1,
      fields: ["test"],
    });
    expect(await client.app.getFormFields({ app: 1 })).toEqual({
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
      app: 1,
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
    const result = await client.app.getFormFields({ app: 1 });
    expect(result.properties.rich_field).toMatchObject({
      type: "SINGLE_LINE_TEXT",
      code: "rich_field",
      label: "リッチフィールド",
      required: true,
      defaultValue: "デフォルト",
    });
  });
});
