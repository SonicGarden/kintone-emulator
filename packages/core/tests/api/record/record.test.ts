import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

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
