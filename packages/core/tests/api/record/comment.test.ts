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

  describe("コメント取得", () => {
    test("レコードのコメント一覧を取得できる", async () => {
      await client!.record.addRecordComment({
        app: 1,
        record: recordId,
        comment: { text: "コメント1" },
      });
      await client!.record.addRecordComment({
        app: 1,
        record: recordId,
        comment: { text: "コメント2" },
      });

      const result = await client!.record.getRecordComments({
        app: 1,
        record: recordId,
      });

      expect(result.comments).toHaveLength(2);
      expect(result.comments[0]!.text).toEqual("コメント2");
      expect(result.comments[1]!.text).toEqual("コメント1");
      expect(result.older).toBe(false);
      expect(result.newer).toBe(false);
    });

    test("order=ascで昇順に取得できる", async () => {
      await client!.record.addRecordComment({
        app: 1,
        record: recordId,
        comment: { text: "コメント1" },
      });
      await client!.record.addRecordComment({
        app: 1,
        record: recordId,
        comment: { text: "コメント2" },
      });

      const result = await client!.record.getRecordComments({
        app: 1,
        record: recordId,
        order: "asc",
      });

      expect(result.comments[0]!.text).toEqual("コメント1");
      expect(result.comments[1]!.text).toEqual("コメント2");
    });

    test("offset・limitで取得範囲を制御できる", async () => {
      for (let i = 1; i <= 3; i++) {
        await client!.record.addRecordComment({
          app: 1,
          record: recordId,
          comment: { text: `コメント${i}` },
        });
      }

      const result = await client!.record.getRecordComments({
        app: 1,
        record: recordId,
        order: "asc",
        offset: 1,
        limit: 1,
      });

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]!.text).toEqual("コメント2");
      expect(result.older).toBe(true);
      expect(result.newer).toBe(true);
    });

    test("mentionsを含むコメントを取得できる", async () => {
      await client!.record.addRecordComment({
        app: 1,
        record: recordId,
        comment: {
          text: "テスト",
          mentions: [{ code: "user1", type: "USER" }],
        },
      });

      const result = await client!.record.getRecordComments({
        app: 1,
        record: recordId,
      });

      expect(result.comments[0]!.mentions).toEqual([
        { code: "user1", type: "USER" },
      ]);
    });

    test("コメントが0件の場合は空配列が返る", async () => {
      const result = await client!.record.getRecordComments({
        app: 1,
        record: recordId,
      });

      expect(result.comments).toEqual([]);
      expect(result.older).toBe(false);
      expect(result.newer).toBe(false);
    });
  });
});
