import type { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeEach, describe, expect, test } from "vitest";
import { getTestEnv } from "../../../src/test-support/config";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

// 実機は state.assignee を省略すると {type:"ONE", entities:[{FIELD_ENTITY:作成者}]} を
// デフォルト適用するため、テストでは assignee を完全省略してシンプルに保つ。
// (updateRecordStatus 側では assignee を必ず渡す: GAIA_SA01 を回避するため)
const STATUS_CONFIG = {
  enable: true,
  states: {
    未処理: { name: "未処理", index: "0" },
    処理中: { name: "処理中", index: "1" },
    完了:   { name: "完了",   index: "2" },
  },
  actions: [
    { name: "処理開始",   from: "未処理", to: "処理中" },
    { name: "完了にする", from: "処理中", to: "完了" },
  ],
};
const DISABLED_STATUS = { enable: false };

const PROPS = {
  title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" },
} as const;

// アクション実行の assignee。実機は必須、エミュレーターは無視するので両モードで共通
const getAssignee = () => getTestEnv().realKintone?.user ?? "test-user";

describeDualMode("プロセス管理: アクション実行とクエリ", () => {
  const SESSION = "record-status-test";
  let client: KintoneRestAPIClient;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
  });

  describe("プロセス管理が有効なアプリ", () => {
    let appId: number;
    let recordIds: number[];

    beforeEach(async () => {
      ({ appId, recordIds } = await createTestApp(SESSION, {
        name: "process-enabled-app",
        properties: PROPS,
        status: STATUS_CONFIG,
        records: [{ title: { value: "a" } }, { title: { value: "b" } }, { title: { value: "c" } }],
      }));
    });

    test("作成したレコードは初期ステータス『未処理』を持つ", async () => {
      const { record } = await client.record.getRecord({ app: appId, id: recordIds[0]! });
      expect(record["ステータス"]).toMatchObject({ type: "STATUS", value: "未処理" });
    });

    test("単体アクション実行でステータスが遷移する", async () => {
      const id = recordIds[0]!;
      const r = await client.record.updateRecordStatus({
        app: appId, id, action: "処理開始", assignee: getAssignee(),
      });
      // revision は遷移後に必ずインクリメントされる。
      // エミュレーターは +1、実機は +2（内部処理で 2 段階）になるため >= 2 で確認
      expect(Number(r.revision)).toBeGreaterThanOrEqual(2);

      const { record } = await client.record.getRecord({ app: appId, id });
      expect((record["ステータス"] as { value: string }).value).toBe("処理中");
    });

    test("from と現在ステータスが一致しないアクションは GAIA_IL03 で拒否される", async () => {
      // 「完了にする」は from=処理中 だが、現在は 未処理 なので不一致
      let err: { code?: string; message?: string } | null = null;
      try {
        await client.record.updateRecordStatus({
          app: appId, id: recordIds[0]!, action: "完了にする", assignee: getAssignee(),
        });
      } catch (e) {
        err = e as { code?: string; message?: string };
      }
      expect(err?.code).toBe("GAIA_IL03");
      // 実機固定メッセージ (ja, 2026-04-30 確認)
      expect(err?.message).toContain("ステータスの変更に失敗しました。");
    });

    test("一括アクションで複数レコードを遷移できる", async () => {
      const r = await client.record.updateRecordsStatus({
        app: appId,
        records: recordIds.slice(0, 2).map((id) => ({
          id, action: "処理開始", assignee: getAssignee(),
        })),
      });
      expect(r.records).toHaveLength(2);
      expect(Number(r.records[0]!.revision)).toBeGreaterThanOrEqual(2);
    });

    test("一括アクション: 1 件失敗すると全件ロールバックされる", async () => {
      // 2件目のレコードは未処理なので「完了にする」(from=処理中) で不一致
      let err: { code?: string } | null = null;
      try {
        await client.record.updateRecordsStatus({
          app: appId,
          records: [
            { id: recordIds[0]!, action: "処理開始",   assignee: getAssignee() }, // 成功するはず
            { id: recordIds[1]!, action: "完了にする", assignee: getAssignee() }, // 失敗
          ],
        });
      } catch (e) {
        err = e as { code?: string };
      }
      expect(err).not.toBeNull();

      // 1件目もロールバックされて未処理のまま
      const { record } = await client.record.getRecord({ app: appId, id: recordIds[0]! });
      expect((record["ステータス"] as { value: string }).value).toBe("未処理");
    });

    test("ステータスでクエリ検索できる (in / =)", async () => {
      // recordIds[0] のみ「処理中」へ遷移
      await client.record.updateRecordStatus({
        app: appId, id: recordIds[0]!, action: "処理開始", assignee: getAssignee(),
      });

      const inProgress = await client.record.getRecords({
        app: appId, query: 'ステータス in ("処理中")',
      });
      expect(inProgress.records).toHaveLength(1);
      expect((inProgress.records[0] as unknown as { $id: { value: string } }).$id.value).toBe(String(recordIds[0]));

      const todo = await client.record.getRecords({
        app: appId, query: 'ステータス = "未処理"',
      });
      expect(todo.records).toHaveLength(2);
    });
  });

  describe("プロセス管理が無効なアプリ", () => {
    let appId: number;
    let recordIds: number[];

    beforeEach(async () => {
      ({ appId, recordIds } = await createTestApp(SESSION, {
        name: "process-disabled-app",
        properties: PROPS,
        status: DISABLED_STATUS,
        records: [{ title: { value: "x" } }],
      }));
    });

    test("レスポンスに ステータス フィールドが含まれない", async () => {
      const { record } = await client.record.getRecord({ app: appId, id: recordIds[0]! });
      expect(record["ステータス"]).toBeUndefined();
    });

    test("アクション実行は GAIA_ST02 で拒否される", async () => {
      let err: { code?: string; message?: string } | null = null;
      try {
        await client.record.updateRecordStatus({
          app: appId, id: recordIds[0]!, action: "処理開始", assignee: getAssignee(),
        });
      } catch (e) {
        err = e as { code?: string; message?: string };
      }
      expect(err?.code).toBe("GAIA_ST02");
      // 実機固定メッセージ (ja, 2026-04-30 確認)
      expect(err?.message).toContain("プロセス管理機能が無効化されています。");
    });
  });
});
