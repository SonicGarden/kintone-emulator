import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { host } from "tests/config";

const SESSION = "app-test-session";
const BASE_URL = `http://${host}/${SESSION}`;

describe("アプリ作成API", () => {
  beforeEach(async () => {
    await fetch(`${BASE_URL}/initialize`, { method: "POST" });
  });

  afterEach(async () => {
    await fetch(`${BASE_URL}/finalize`, { method: "POST" });
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
    const res1 = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "アプリ1" }),
    });
    const data1 = await res1.json();

    const res2 = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "アプリ2" }),
    });
    const data2 = await res2.json();

    expect(Number(data2.app)).toBeGreaterThan(Number(data1.app));
  });

  test("properties 付きでアプリを作成するとフィールドが登録される", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "フィールド付きアプリ",
        properties: {
          text_field: {
            type: "SINGLE_LINE_TEXT",
            label: "テキスト",
          },
        },
      }),
    });
    const data = await response.json();
    const appId = Number(data.app);

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

    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "フィールドなしアプリ" }),
    });
    const data = await response.json();
    const appId = Number(data.app);

    const formResult = await client.app.getFormFields({ app: appId });
    expect(formResult.properties).toEqual({});
  });

  test("複数フィールドを一度に登録できる", async () => {
    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });

    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });
    const data = await response.json();
    const appId = Number(data.app);

    const formResult = await client.app.getFormFields({ app: appId });
    expect(formResult.properties).toHaveProperty("field1");
    expect(formResult.properties).toHaveProperty("field2");
  });
});
