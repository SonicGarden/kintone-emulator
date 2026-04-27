import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("status-test-session");
});

describeEmulatorOnly("プロセス管理の設定取得API", () => {
  beforeEach(async () => {
    await initializeSession(BASE_URL);
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("プロセス管理未設定のアプリではデフォルト値が返る", async () => {
    const appId = (await createApp(BASE_URL, { name: "テストアプリ" })).appId;
    const response = await fetch(`${BASE_URL}/k/v1/app/status.json?app=${appId}`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toEqual({
      enable: false,
      states: null,
      actions: null,
      revision: "3",
    });
  });

  test("プロセス管理を設定したアプリで正しい設定が返る", async () => {
    const statusConfig = {
      enable: true,
      states: {
        未処理: {
          name: "未処理",
          index: "0",
          assignee: { type: "ONE", entities: [] },
        },
        処理中: {
          name: "処理中",
          index: "1",
          assignee: { type: "ONE", entities: [{ entity: { type: "USER", code: "user1" }, includeSubs: false }] },
        },
        完了: {
          name: "完了",
          index: "2",
          assignee: { type: "ONE", entities: [] },
        },
      },
      actions: [
        {
          name: "処理開始",
          from: "未処理",
          to: "処理中",
          filterCond: "",
        },
        {
          name: "完了にする",
          from: "処理中",
          to: "完了",
          filterCond: "",
        },
      ],
      revision: "10",
    };

    const appId = (await createApp(BASE_URL, {
      name: "プロセス管理アプリ",
      status: statusConfig,
    })).appId;

    const response = await fetch(`${BASE_URL}/k/v1/app/status.json?app=${appId}`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.enable).toBe(true);
    expect(data.revision).toBe("10");
    expect(Object.keys(data.states)).toEqual(["未処理", "処理中", "完了"]);
    expect(data.states["処理中"].assignee.entities).toHaveLength(1);
    expect(data.actions).toHaveLength(2);
    expect(data.actions[0].name).toBe("処理開始");
    expect(data.actions[1].name).toBe("完了にする");
  });

  test("存在しないアプリで GAIA_AP01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/app/status.json?app=99999`);
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.code).toBe("GAIA_AP01");
  });

  test("appパラメータ未指定で CB_VA01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/app/status.json`);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors).toEqual({ app: { messages: ["必須です。"] } });
  });

  test("appパラメータが非整数で CB_VA01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/app/status.json?app=abc`);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors).toEqual({ app: { messages: ["最小でも1以上です。"] } });
  });

  test("appパラメータが0で CB_VA01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/app/status.json?app=0`);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors.app.messages).toContain("最小でも1以上です。");
  });
});
