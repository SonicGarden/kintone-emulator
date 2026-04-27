import { KintoneRestAPIClient, KintoneRestAPIError } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createBaseUrl, createApp, finalizeSession, initializeSession } from "../helpers";
import { describeEmulatorOnly } from "../real-kintone";

const SESSION = "failure-injection";
let BASE_URL: string;

beforeAll(() => {
  BASE_URL = createBaseUrl(SESSION);
});

const setupFailure = (body: unknown) =>
  fetch(`${BASE_URL}/setup/failure.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const clearFailureRequest = () =>
  fetch(`${BASE_URL}/setup/failure.json`, { method: "DELETE" });

const setupRateLimit = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE_URL}/setup/failure/rate-limit.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describeEmulatorOnly("障害注入 (setup/failure)", () => {
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    ({ appId } = await createApp(BASE_URL, {
      name: "failure-injection",
      properties: { test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" } },
      records: [{ test: { value: "a" } }],
    }));
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  describe("汎用 POST /setup/failure.json", () => {
    test("count: 1 で次の API リクエストが 503 + 素のテキストを返す", async () => {
      const setupRes = await setupFailure({
        count: 1,
        status: 503,
        body: "Service Unavailable",
      });
      expect(setupRes.status).toBe(200);

      // rest-api-client は text/plain の 503 を素の Error にする (KintoneRestAPIError ではない)
      let thrown: unknown = null;
      try {
        await client.record.getRecord({ app: appId, id: 1 });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(KintoneRestAPIError);
      expect((thrown as Error).message).toBe("503: Service Unavailable");
    });

    test("count: 1 は one-shot (発火後は通常レスポンスに戻る)", async () => {
      await setupFailure({ count: 1, status: 503, body: "fail" });
      await expect(client.record.getRecord({ app: appId, id: 1 })).rejects.toThrow();
      const ok = await client.record.getRecord({ app: appId, id: 1 });
      expect(ok.record.test).toEqual({ value: "a", type: "SINGLE_LINE_TEXT" });
    });

    test("count: 3 で 3 連続失敗、4 回目以降は通常 (リトライ検証)", async () => {
      await setupFailure({ count: 3, status: 503, body: "fail" });
      for (let i = 0; i < 3; i++) {
        const fail = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
        expect(fail.status).toBe(503);
      }
      const ok = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      expect(ok.status).toBe(200);
    });

    test("skip: 1, count: 1 で 1 回目は成功、2 回目で発火", async () => {
      await setupFailure({ skip: 1, count: 1, status: 503, body: "fail" });
      const ok = await client.record.getRecord({ app: appId, id: 1 });
      expect(ok.record.test).toEqual({ value: "a", type: "SINGLE_LINE_TEXT" });
      await expect(client.record.getRecord({ app: appId, id: 1 })).rejects.toThrow();
    });

    test("skip: 1, count: 3 で 1 回成功 → 2-4 失敗 → 5 回目以降通常", async () => {
      await setupFailure({ skip: 1, count: 3, status: 503, body: "fail" });
      const ok1 = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      expect(ok1.status).toBe(200);
      for (let i = 0; i < 3; i++) {
        const fail = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
        expect(fail.status).toBe(503);
      }
      const ok2 = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      expect(ok2.status).toBe(200);
    });

    test("DELETE で発火前に解除できる", async () => {
      await setupFailure({ count: 1, status: 503, body: "fail" });
      await clearFailureRequest();
      const ok = await client.record.getRecord({ app: appId, id: 1 });
      expect(ok.record.test).toEqual({ value: "a", type: "SINGLE_LINE_TEXT" });
    });

    test("pathPattern 指定時は対象外パスではカウントされない", async () => {
      await setupFailure({
        count: 1,
        status: 503,
        body: "fail",
        pathPattern: "/k/v1/records.json",
      });
      // record.json (single) は pathPattern にマッチしないので消費されない
      const ok = await client.record.getRecord({ app: appId, id: 1 });
      expect(ok.record.test).toEqual({ value: "a", type: "SINGLE_LINE_TEXT" });
      // records.json は対象になる
      await expect(client.record.getRecords({ app: appId })).rejects.toThrow();
    });

    test("count 省略で永続発火 (メンテナンス再現)", async () => {
      await setupFailure({ status: 503, body: "Service Unavailable" });
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
        expect(res.status).toBe(503);
      }
    });

    test("count 省略 (永続) でも DELETE で解除できる", async () => {
      await setupFailure({ status: 503, body: "Service Unavailable" });
      const fail = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      expect(fail.status).toBe(503);
      await clearFailureRequest();
      const ok = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      expect(ok.status).toBe(200);
    });

    test("skip + count 省略で「N 回スキップしてから永続失敗」になる", async () => {
      await setupFailure({ skip: 2, status: 503, body: "Service Unavailable" });
      // 1, 2 回目は通常応答、3 回目以降は全部 503
      for (let i = 0; i < 2; i++) {
        const ok = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
        expect(ok.status).toBe(200);
      }
      for (let i = 0; i < 3; i++) {
        const fail = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
        expect(fail.status).toBe(503);
      }
    });

    test("body が object のときは application/json として返り KintoneRestAPIError 経路になる", async () => {
      await setupFailure({
        count: 1,
        status: 520,
        body: { code: "GAIA_DA02", id: "abc", message: "test failure" },
      });
      let thrown: unknown = null;
      try {
        await client.record.getRecord({ app: appId, id: 1 });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(KintoneRestAPIError);
      expect(thrown).toMatchObject({ code: "GAIA_DA02", status: 520 });
    });

    test("count: 0 はバリデーションエラー", async () => {
      const res = await setupFailure({ count: 0, status: 503, body: "x" });
      expect(res.status).toBe(400);
    });

    test("skip が負数はバリデーションエラー", async () => {
      const res = await setupFailure({ skip: -1, count: 1, status: 503, body: "x" });
      expect(res.status).toBe(400);
    });
  });

  describe("ショートカット POST /setup/failure/rate-limit.json", () => {
    test("count: 1 で 429 / GAIA_TO04 / 日本語 message が返る", async () => {
      await setupRateLimit({ count: 1 });
      let thrown: unknown = null;
      try {
        await client.record.getRecord({ app: appId, id: 1 });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(KintoneRestAPIError);
      expect(thrown).toMatchObject({
        status: 429,
        code: "GAIA_TO04",
        message: expect.stringContaining("APIの同時リクエスト数が上限を超えています。"),
      });
    });

    test("Accept-Language: en で英語 message が返る", async () => {
      await setupRateLimit({ count: 1 }, { "Accept-Language": "en" });
      // 直接 fetch で確認 (rest-api-client の message は status / code 等で装飾されるため)
      const res = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      expect(res.status).toBe(429);
      const body = (await res.json()) as { code: string; message: string };
      expect(body.code).toBe("GAIA_TO04");
      expect(body.message).toBe("The number of concurrent API requests exceeds the limit.");
    });

    test("実機準拠のヘッダが付与される", async () => {
      await setupRateLimit({ count: 1 });
      const res = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      expect(res.status).toBe(429);
      expect(res.headers.get("x-cybozu-error")).toBe("GAIA_TO04");
      expect(res.headers.get("x-concurrencylimit-limit")).toBe("100");
      expect(res.headers.get("x-concurrencylimit-running")).toBe("101");
    });

    test("id は毎回異なる", async () => {
      await setupRateLimit({ count: 1 });
      const res1 = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      const body1 = (await res1.json()) as { id: string };

      await setupRateLimit({ count: 1 });
      const res2 = await fetch(`${BASE_URL}/k/v1/record.json?app=${appId}&id=1`);
      const body2 = (await res2.json()) as { id: string };

      expect(body1.id).not.toBe(body2.id);
      expect(body1.id).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  test("initialize 時に障害注入はクリアされる", async () => {
    await setupFailure({ count: 1, status: 503, body: "fail" });
    await finalizeSession(BASE_URL);
    await initializeSession(BASE_URL);
    ({ appId } = await createApp(BASE_URL, {
      name: "after-reinit",
      properties: { test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" } },
      records: [{ test: { value: "a" } }],
    }));
    const ok = await client.record.getRecord({ app: appId, id: 1 });
    expect(ok.record.test).toEqual({ value: "a", type: "SINGLE_LINE_TEXT" });
  });
});
