import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeEach, describe, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment, testEmulatorOnly } from "../../real-kintone";

describeDualMode("アプリのレコードコメントAPI", () => {
  const SESSION = "comment-test-session";
  let client: KintoneRestAPIClient;
  let appId: number;
  let recordId: string;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "comment test",
      properties: {
        test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" },
      },
    }));

    const record = await client.record.addRecord({
      app: appId,
      record: { test: { value: "test" } },
    });
    recordId = record.id;
  });

  test("レコードにコメントを追加できる", async () => {
    const result = await client.record.addRecordComment({
      app: appId,
      record: recordId,
      comment: { text: "テストコメント" },
    });
    expect(result).toEqual({ id: expect.any(String) });
  });

  test("存在しないレコードIDでエラーになる", async () => {
    await expect(
      client.record.addRecordComment({
        app: appId,
        record: "99999999",
        comment: { text: "テストコメント" },
      }),
    ).rejects.toThrow();
  });

  test("存在しないアプリIDでエラーになる", async () => {
    await expect(
      client.record.addRecordComment({
        app: 99999999,
        record: recordId,
        comment: { text: "テストコメント" },
      }),
    ).rejects.toThrow();
  });

  test("コメントを削除できる", async () => {
    const added = await client.record.addRecordComment({
      app: appId,
      record: recordId,
      comment: { text: "削除するコメント" },
    });
    await expect(
      client.record.deleteRecordComment({
        app: appId, record: recordId, comment: added.id,
      }),
    ).resolves.not.toThrow();
  });

  test("存在しないコメントIDを削除しようとするとエラーになる", async () => {
    await expect(
      client.record.deleteRecordComment({
        app: appId, record: recordId, comment: "99999999",
      }),
    ).rejects.toThrow();
  });

  // 実機のコメント追加ではダミーユーザーコード (`{code: "test", type: "USER"}`) が
  // 「無効なユーザー」として拒否される。emulator でのみ実行する
  testEmulatorOnly("mentionsを含むコメントを追加できる", async () => {
    const result = await client.record.addRecordComment({
      app: appId,
      record: recordId,
      comment: {
        text: "@test さん、確認お願いします",
        mentions: [{ code: "test", type: "USER" }],
      },
    });
    expect(result).toEqual({ id: expect.any(String) });
  });

  describe("コメント取得", () => {
    // 実機はコメントテキストの末尾に空白を付加して返すため trim() で比較する
    test("レコードのコメント一覧を取得できる", async () => {
      await client.record.addRecordComment({
        app: appId, record: recordId, comment: { text: "コメント1" },
      });
      await client.record.addRecordComment({
        app: appId, record: recordId, comment: { text: "コメント2" },
      });

      const result = await client.record.getRecordComments({
        app: appId, record: recordId,
      });

      expect(result.comments).toHaveLength(2);
      expect(result.comments[0]!.text.trim()).toEqual("コメント2");
      expect(result.comments[1]!.text.trim()).toEqual("コメント1");
      expect(result.older).toBe(false);
      expect(result.newer).toBe(false);
    });

    test("order=ascで昇順に取得できる", async () => {
      await client.record.addRecordComment({
        app: appId, record: recordId, comment: { text: "コメント1" },
      });
      await client.record.addRecordComment({
        app: appId, record: recordId, comment: { text: "コメント2" },
      });

      const result = await client.record.getRecordComments({
        app: appId, record: recordId, order: "asc",
      });

      expect(result.comments[0]!.text.trim()).toEqual("コメント1");
      expect(result.comments[1]!.text.trim()).toEqual("コメント2");
    });

    test("offset・limitで取得範囲を制御できる", async () => {
      for (let i = 1; i <= 3; i++) {
        await client.record.addRecordComment({
          app: appId, record: recordId, comment: { text: `コメント${i}` },
        });
      }

      const result = await client.record.getRecordComments({
        app: appId, record: recordId, order: "asc", offset: 1, limit: 1,
      });

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]!.text.trim()).toEqual("コメント2");
      expect(result.older).toBe(true);
      expect(result.newer).toBe(true);
    });

    // mention コメントの読み取りはエミュ専用（ダミーコードは実機に存在しない）
    testEmulatorOnly("mentionsを含むコメントを取得できる", async () => {
      await client.record.addRecordComment({
        app: appId,
        record: recordId,
        comment: {
          text: "テスト",
          mentions: [{ code: "user1", type: "USER" }],
        },
      });

      const result = await client.record.getRecordComments({
        app: appId, record: recordId,
      });

      expect(result.comments[0]!.mentions).toEqual([
        { code: "user1", type: "USER" },
      ]);
    });

    test("コメントが0件の場合は空配列が返る", async () => {
      const result = await client.record.getRecordComments({
        app: appId, record: recordId,
      });

      expect(result.comments).toEqual([]);
      expect(result.older).toBe(false);
      expect(result.newer).toBe(false);
    });
  });
});
