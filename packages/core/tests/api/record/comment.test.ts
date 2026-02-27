import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("comment-test-session");
});

describe("アプリのレコードコメントAPI", () => {
  let client: KintoneRestAPIClient | undefined = undefined;
  let recordId: string;

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

    // テスト用のレコードを作成
    const record = await client.record.addRecord({
      app: 1,
      record: {
        test: {
          value: "test",
        },
      },
    });
    recordId = record.id;
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("レコードにコメントを追加できる", async () => {
    const result = await client!.record.addRecordComment({
      app: 1,
      record: recordId,
      comment: {
        text: "テストコメント",
      },
    });

    expect(result).toEqual({
      id: expect.any(String),
    });
  });

  test("mentionsを含むコメントを追加できる", async () => {
    const result = await client!.record.addRecordComment({
      app: 1,
      record: recordId,
      comment: {
        text: "@test さん、確認お願いします",
        mentions: [
          {
            code: "test",
            type: "USER",
          },
        ],
      },
    });

    expect(result).toEqual({
      id: expect.any(String),
    });
  });

  test("存在しないレコードIDでエラーになる", async () => {
    await expect(
      client!.record.addRecordComment({
        app: 1,
        record: "9999",
        comment: {
          text: "テストコメント",
        },
      })
    ).rejects.toThrow();
  });

  test("存在しないアプリIDでエラーになる", async () => {
    await expect(
      client!.record.addRecordComment({
        app: 9999,
        record: recordId,
        comment: {
          text: "テストコメント",
        },
      })
    ).rejects.toThrow();
  });

  test("コメントを削除できる", async () => {
    const added = await client!.record.addRecordComment({
      app: 1,
      record: recordId,
      comment: { text: "削除するコメント" },
    });
    await expect(
      client!.record.deleteRecordComment({
        app: 1,
        record: recordId,
        comment: added.id,
      })
    ).resolves.not.toThrow();
  });

  test("存在しないコメントIDを削除しようとするとエラーになる", async () => {
    await expect(
      client!.record.deleteRecordComment({
        app: 1,
        record: recordId,
        comment: "9999",
      })
    ).rejects.toThrow();
  });
});
