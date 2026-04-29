import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("record-status-test");
});

const STATUS_CONFIG = {
  enable: true,
  states: {
    未処理: { name: "未処理", index: "0", assignee: { type: "ONE", entities: [] } },
    処理中: { name: "処理中", index: "1", assignee: { type: "ONE", entities: [] } },
    完了:   { name: "完了",   index: "2", assignee: { type: "ONE", entities: [] } },
  },
  actions: [
    { name: "処理開始",   from: "未処理", to: "処理中", filterCond: "" },
    { name: "完了にする", from: "処理中", to: "完了",   filterCond: "" },
  ],
  revision: "10",
};

describeEmulatorOnly("プロセス管理: アクション実行とクエリ", () => {
  beforeEach(async () => {
    await initializeSession(BASE_URL);
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("プロセス管理有効アプリで作成したレコードは初期ステータスを持つ", async () => {
    const { appId, recordIds } = await createApp(BASE_URL, {
      name: "プロセス管理アプリ",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      status: STATUS_CONFIG,
      records: [{ title: { value: "first" } }, { title: { value: "second" } }],
    });
    expect(recordIds).toHaveLength(2);

    const res = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=${recordIds[0]}`);
    const data = await res.json();
    expect(data.record["ステータス"]).toEqual({ type: "STATUS", value: "未処理" });
  });

  test("プロセス管理が無効なアプリではステータスを付与しない", async () => {
    const { appId, recordIds } = await createApp(BASE_URL, {
      name: "通常アプリ",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      records: [{ title: { value: "first" } }],
    });
    const res = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=${recordIds[0]}`);
    const data = await res.json();
    expect(data.record["ステータス"]).toBeUndefined();
  });

  test("単体アクション実行でステータスが遷移する", async () => {
    const { appId, recordIds } = await createApp(BASE_URL, {
      name: "アプリ",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      status: STATUS_CONFIG,
      records: [{ title: { value: "task" } }],
    });
    const id = recordIds[0]!;

    const res = await fetch(`${BASE_URL}/k/v1/record/status.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: appId, id, action: "処理開始" }),
    });
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.revision).toBe("2");

    const get = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=${id}`);
    const data = await get.json();
    expect(data.record["ステータス"].value).toBe("処理中");
  });

  test("from と現在ステータスが一致しないアクションは GAIA_ST01 で拒否される", async () => {
    const { appId, recordIds } = await createApp(BASE_URL, {
      name: "アプリ",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      status: STATUS_CONFIG,
      records: [{ title: { value: "task" } }],
    });
    const res = await fetch(`${BASE_URL}/k/v1/record/status.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: appId, id: recordIds[0], action: "完了にする" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("GAIA_ST01");
  });

  test("プロセス管理が有効でないアプリは GAIA_ST02 を返す", async () => {
    const { appId, recordIds } = await createApp(BASE_URL, {
      name: "通常アプリ",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      records: [{ title: { value: "task" } }],
    });
    const res = await fetch(`${BASE_URL}/k/v1/record/status.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: appId, id: recordIds[0], action: "処理開始" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("GAIA_ST02");
  });

  test("一括アクション実行で複数レコードを遷移できる", async () => {
    const { appId, recordIds } = await createApp(BASE_URL, {
      name: "アプリ",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      status: STATUS_CONFIG,
      records: [{ title: { value: "a" } }, { title: { value: "b" } }, { title: { value: "c" } }],
    });
    const res = await fetch(`${BASE_URL}/k/v1/records/status.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: appId,
        records: recordIds.slice(0, 2).map((id) => ({ id, action: "処理開始" })),
      }),
    });
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.records).toHaveLength(2);
    expect(json.records[0].revision).toBe("2");
  });

  test("ステータスでクエリ検索できる", async () => {
    const { appId, recordIds } = await createApp(BASE_URL, {
      name: "アプリ",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      status: STATUS_CONFIG,
      records: [{ title: { value: "a" } }, { title: { value: "b" } }, { title: { value: "c" } }],
    });
    // recordIds[0] のみ「処理中」へ遷移
    await fetch(`${BASE_URL}/k/v1/record/status.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: appId, id: recordIds[0], action: "処理開始" }),
    });

    const q1 = await fetch(
      `${BASE_URL}/k/v1/records.json?app=${appId}&query=${encodeURIComponent('ステータス in ("処理中")')}`,
    );
    const d1 = await q1.json();
    expect(d1.records).toHaveLength(1);
    expect(d1.records[0]["$id"].value).toBe(String(recordIds[0]));

    const q2 = await fetch(
      `${BASE_URL}/k/v1/records.json?app=${appId}&query=${encodeURIComponent('ステータス in ("未処理")')}`,
    );
    const d2 = await q2.json();
    expect(d2.records).toHaveLength(2);

    const q3 = await fetch(
      `${BASE_URL}/k/v1/records.json?app=${appId}&query=${encodeURIComponent('ステータス = "未処理"')}`,
    );
    const d3 = await q3.json();
    expect(d3.records).toHaveLength(2);
  });

  test("一括アクション実行: 1件失敗すると全体ロールバックされる", async () => {
    const { appId, recordIds } = await createApp(BASE_URL, {
      name: "アプリ",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      status: STATUS_CONFIG,
      records: [{ title: { value: "a" } }, { title: { value: "b" } }],
    });
    // 2件目に対して「完了にする」を投げると from=処理中 不一致で失敗するはず
    const res = await fetch(`${BASE_URL}/k/v1/records/status.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: appId,
        records: [
          { id: recordIds[0], action: "処理開始" },
          { id: recordIds[1], action: "完了にする" },
        ],
      }),
    });
    expect(res.status).toBe(400);

    // 1件目もロールバックされている
    const get = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=${recordIds[0]}`);
    const data = await get.json();
    expect(data.record["ステータス"].value).toBe("未処理");
  });
});
