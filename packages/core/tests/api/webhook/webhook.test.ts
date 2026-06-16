import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

const SESSION = "webhook";
let BASE_URL: string;

// Webhook 受信サーバー。配信されたペイロードを received に貯める。
type Received = { url: string | undefined; body: Record<string, unknown> };
let server: Server;
let receiverUrl: string;
let received: Received[] = [];

// 固定 sleep ではなく条件ポーリングで待つ（同期前提のテストが非同期化/実環境で flaky になる罠を避ける）
const waitFor = async (
  predicate: () => boolean,
  { timeout = 2000, interval = 20 }: { timeout?: number; interval?: number } = {},
): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("timeout waiting for webhook delivery");
    }
    await new Promise((r) => setTimeout(r, interval));
  }
};

const setupWebhook = (body: unknown) =>
  fetch(`${BASE_URL}/setup/webhook.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  BASE_URL = createBaseUrl(SESSION);
  server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      received.push({ url: req.url, body: data ? JSON.parse(data) : {} });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ result: "ok" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  receiverUrl = `http://127.0.0.1:${port}/webhook`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describeEmulatorOnly("Webhook 配信 (setup/webhook)", () => {
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    received = [];
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    ({ appId } = await createApp(BASE_URL, {
      name: "webhook-app",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
    }));
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("ADD_RECORD: レコード追加で kintone 互換ペイロードが届く", async () => {
    const res = await setupWebhook({
      app: appId,
      webhooks: [{ url: receiverUrl, events: ["ADD_RECORD"] }],
    });
    expect(res.status).toBe(200);

    const { id } = await client.record.addRecord({ app: appId, record: { title: { value: "hello" } } });

    await waitFor(() => received.length >= 1);
    expect(received).toHaveLength(1);

    const payload = received[0]!.body;
    expect(payload.type).toBe("ADD_RECORD");
    expect(payload.id).toEqual(expect.any(String));
    expect(payload.app).toMatchObject({ id: String(appId), name: "webhook-app" });
    expect((payload.record as Record<string, { value: unknown }>).title).toMatchObject({
      type: "SINGLE_LINE_TEXT",
      value: "hello",
    });
    // getRecord 同形式: $id / $revision を含む
    expect((payload.record as Record<string, { value: unknown }>).$id).toMatchObject({ value: id });
    expect(payload.recordTitle).toEqual(expect.any(String));
    expect(payload.url).toContain(`/k/${appId}/show#record=${id}`);
  });

  test("UPDATE_RECORD: レコード更新で届く", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { title: { value: "a" } } });
    await setupWebhook({ app: appId, webhooks: [{ url: receiverUrl, events: ["UPDATE_RECORD"] }] });

    await client.record.updateRecord({ app: appId, id, record: { title: { value: "b" } } });

    await waitFor(() => received.length >= 1);
    const payload = received[0]!.body;
    expect(payload.type).toBe("UPDATE_RECORD");
    expect((payload.record as Record<string, { value: unknown }>).title).toMatchObject({ value: "b" });
  });

  test("一括追加: レコード毎に1通ずつ届く", async () => {
    await setupWebhook({ app: appId, webhooks: [{ url: receiverUrl, events: ["ADD_RECORD"] }] });

    await client.record.addRecords({
      app: appId,
      records: [{ title: { value: "x" } }, { title: { value: "y" } }, { title: { value: "z" } }],
    });

    await waitFor(() => received.length >= 3);
    expect(received).toHaveLength(3);
    expect(received.every((r) => r.body.type === "ADD_RECORD")).toBe(true);
  });

  test("登録されていないイベントは配信されない", async () => {
    // ADD_RECORD のみ登録 → UPDATE_RECORD は届かない
    const { id } = await client.record.addRecord({ app: appId, record: { title: { value: "a" } } });
    await setupWebhook({ app: appId, webhooks: [{ url: receiverUrl, events: ["ADD_RECORD"] }] });
    received = [];

    await client.record.updateRecord({ app: appId, id, record: { title: { value: "b" } } });

    // 少し待っても届かないことを確認（届いてしまうなら waitFor 内で検知される）
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
  });

  test("DELETE_RECORD: recordId/deletedBy/deletedAt を含み record は含まない", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { title: { value: "a" } } });
    await setupWebhook({ app: appId, webhooks: [{ url: receiverUrl, events: ["DELETE_RECORD"] }] });

    await client.record.deleteRecords({ app: appId, ids: [id] });

    await waitFor(() => received.length >= 1);
    const payload = received[0]!.body;
    expect(payload.type).toBe("DELETE_RECORD");
    expect(payload.recordId).toBe(String(id));
    expect(payload.deletedBy).toMatchObject({ code: expect.any(String), name: expect.any(String) });
    // 実機同様、秒精度（ミリ秒なし）の ISO 8601
    expect(payload.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(payload.record).toBeUndefined();
  });

  test("ADD_RECORD_COMMENT: コメント追加で届く", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { title: { value: "a" } } });
    await setupWebhook({ app: appId, webhooks: [{ url: receiverUrl, events: ["ADD_RECORD_COMMENT"] }] });

    await client.record.addRecordComment({ app: appId, record: id, comment: { text: "コメント" } });

    await waitFor(() => received.length >= 1);
    const payload = received[0]!.body;
    expect(payload.type).toBe("ADD_RECORD_COMMENT");
    expect(payload.recordId).toBe(String(id));
    const comment = payload.comment as { id: string; text: string; createdAt: string; creator: unknown; mentions: unknown[] };
    expect(comment.text).toBe("コメント");
    expect(comment.id).toEqual(expect.any(String));
    expect(comment.mentions).toEqual([]);
    // コメント URL は #record={id}&comment={commentId}
    expect(payload.url).toContain(`/k/${appId}/show#record=${id}&comment=${comment.id}`);
  });

  test("ADD_RECORD_COMMENT: メンション付きコメントが透過される", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { title: { value: "a" } } });
    await setupWebhook({ app: appId, webhooks: [{ url: receiverUrl, events: ["ADD_RECORD_COMMENT"] }] });

    await client.record.addRecordComment({
      app: appId,
      record: id,
      comment: {
        text: "ai-user Hello",
        mentions: [{ code: "shunichi+ai@sonicgarden.jp", type: "USER" }],
      },
    });

    await waitFor(() => received.length >= 1);
    const comment = received[0]!.body.comment as { text: string; mentions: unknown[] };
    expect(comment.text).toBe("ai-user Hello");
    expect(comment.mentions).toEqual([{ code: "shunichi+ai@sonicgarden.jp", type: "USER" }]);
  });

  test("複数イベント登録時、対象イベントのみ配信される", async () => {
    await setupWebhook({
      app: appId,
      webhooks: [{ url: receiverUrl, events: ["ADD_RECORD", "UPDATE_RECORD"] }],
    });

    const { id } = await client.record.addRecord({ app: appId, record: { title: { value: "a" } } });
    await waitFor(() => received.length >= 1);
    await client.record.updateRecord({ app: appId, id, record: { title: { value: "b" } } });
    await waitFor(() => received.length >= 2);

    expect(received.map((r) => r.body.type)).toEqual(["ADD_RECORD", "UPDATE_RECORD"]);
  });

  test("配信先が到達不能でもレコード操作 API は成功する", async () => {
    // 接続拒否される URL を登録（discard ポート相当）
    await setupWebhook({
      app: appId,
      webhooks: [{ url: "http://127.0.0.1:1/", events: ["ADD_RECORD"] }],
    });

    const result = await client.record.addRecord({ app: appId, record: { title: { value: "a" } } });
    expect(result.id).toEqual(expect.any(String));
  });

  test("DELETE で登録解除すると配信されなくなる", async () => {
    await setupWebhook({ app: appId, webhooks: [{ url: receiverUrl, events: ["ADD_RECORD"] }] });
    await fetch(`${BASE_URL}/setup/webhook.json?app=${appId}`, { method: "DELETE" });

    await client.record.addRecord({ app: appId, record: { title: { value: "a" } } });

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
  });

  test("events に未知の値を含む登録は 400 で拒否される", async () => {
    const res = await setupWebhook({
      app: appId,
      webhooks: [{ url: receiverUrl, events: ["NOT_AN_EVENT"] }],
    });
    expect(res.status).toBe(400);
  });

  test("setup/app.json の webhooks でアプリ作成と同時に登録できる", async () => {
    // 別アプリを webhooks 付きで作成
    const { appId: appId2 } = await createApp(BASE_URL, {
      name: "webhook-app-2",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      webhooks: [{ url: receiverUrl, events: ["ADD_RECORD"] }],
    });

    await client.record.addRecord({ app: appId2, record: { title: { value: "a" } } });

    await waitFor(() => received.length >= 1);
    const payload = received[0]!.body;
    expect(payload.type).toBe("ADD_RECORD");
    expect(payload.app).toMatchObject({ id: String(appId2), name: "webhook-app-2" });
  });

  test("setup/app.json: 初期 records では Webhook は発火しない", async () => {
    // webhooks 登録済みで初期レコードを作っても通知は飛ばない（実機でも設定後の操作のみ対象）
    await createApp(BASE_URL, {
      name: "webhook-app-3",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      webhooks: [{ url: receiverUrl, events: ["ADD_RECORD"] }],
      records: [{ title: { value: "seed" } }],
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
  });
});

describeEmulatorOnly("Webhook 配信: UPDATE_STATUS", () => {
  const EMPTY_ASSIGNEE = { type: "ONE", entities: [] };
  const STATUS_CONFIG = {
    enable: true,
    states: {
      未処理: { name: "未処理", index: "0", assignee: EMPTY_ASSIGNEE },
      処理中: { name: "処理中", index: "1", assignee: EMPTY_ASSIGNEE },
    },
    actions: [{ name: "処理開始", from: "未処理", to: "処理中" }],
  };

  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    received = [];
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    ({ appId } = await createApp(BASE_URL, {
      name: "webhook-status-app",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" } },
      status: STATUS_CONFIG,
      records: [{ title: { value: "a" } }],
    }));
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("ステータス変更で UPDATE_STATUS が届く", async () => {
    await setupWebhook({ app: appId, webhooks: [{ url: receiverUrl, events: ["UPDATE_STATUS"] }] });

    await client.record.updateRecordStatus({ app: appId, id: 1, action: "処理開始" });

    await waitFor(() => received.length >= 1);
    const payload = received[0]!.body;
    expect(payload.type).toBe("UPDATE_STATUS");
    expect((payload.record as Record<string, { value: unknown }>)["ステータス"]).toMatchObject({
      value: "処理中",
    });
  });
});
