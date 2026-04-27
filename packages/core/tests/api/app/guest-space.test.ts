import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession, setupSpace } from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("guest-space-test-session");
});

describeEmulatorOnly("ゲストスペース", () => {
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    // 通常スペース 1 とゲストスペース 2 を用意
    await setupSpace(BASE_URL, { id: 1, isGuest: false, name: "通常スペース" });
    await setupSpace(BASE_URL, { id: 2, isGuest: true, name: "ゲストスペース" });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("getApps は spaceId/threadId を実値で返す", async () => {
    await createApp(BASE_URL, { name: "通常 app", spaceId: 1, threadId: 1 });
    await createApp(BASE_URL, { name: "ゲスト app", spaceId: 2, threadId: 2 });
    const client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });

    const result = await client.app.getApps({});
    const byName = Object.fromEntries(result.apps.map((a) => [a.name, a]));
    expect(byName["通常 app"]).toMatchObject({ spaceId: "1", threadId: "1" });
    expect(byName["ゲスト app"]).toMatchObject({ spaceId: "2", threadId: "2" });
  });

  test("非ゲストパスでゲストスペースのアプリを getApp すると GAIA_IL23", async () => {
    const { appId } = await createApp(BASE_URL, { name: "ゲスト app", spaceId: 2, threadId: 2 });

    const response = await fetch(`${BASE_URL}/k/v1/app.json?id=${appId}`);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("GAIA_IL23");
  });

  test("ゲストパスで guestSpaceId が一致するアプリを getApp できる", async () => {
    const { appId } = await createApp(BASE_URL, { name: "ゲスト app", spaceId: 2, threadId: 2 });

    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
      guestSpaceId: 2,
    });
    const result = await client.app.getApp({ id: appId });
    expect(result.appId).toBe(String(appId));
    expect(result.spaceId).toBe("2");
  });

  test("ゲストパスで通常スペースのアプリを getApp すると CB_NO02", async () => {
    const { appId } = await createApp(BASE_URL, { name: "通常 app", spaceId: 1, threadId: 1 });

    const response = await fetch(`${BASE_URL}/k/guest/2/v1/app.json?id=${appId}`);
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.code).toBe("CB_NO02");
  });

  test("非ゲストパスでゲストスペースのアプリの records を取得すると GAIA_IL23", async () => {
    const { appId } = await createApp(BASE_URL, {
      name: "ゲスト app",
      spaceId: 2,
      threadId: 2,
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "title" } },
      records: [{ title: { value: "a" } }],
    });

    const response = await fetch(`${BASE_URL}/k/v1/records.json?app=${appId}`);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("GAIA_IL23");
  });

  test("ゲストパスで guestSpaceId が一致するアプリのレコードを取得できる", async () => {
    const { appId } = await createApp(BASE_URL, {
      name: "ゲスト app",
      spaceId: 2,
      threadId: 2,
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "title" } },
      records: [{ title: { value: "a" } }],
    });

    const client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
      guestSpaceId: 2,
    });
    const result = await client.record.getRecords({ app: appId });
    expect(result.records).toHaveLength(1);
  });

  test("非ゲストパスでゲスト app の form fields を取得すると GAIA_IL23", async () => {
    const { appId } = await createApp(BASE_URL, {
      name: "ゲスト app",
      spaceId: 2,
      threadId: 2,
      properties: { foo: { type: "SINGLE_LINE_TEXT", code: "foo", label: "foo" } },
    });
    const response = await fetch(`${BASE_URL}/k/v1/app/form/fields.json?app=${appId}`);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("GAIA_IL23");
  });

  test("ユーザーの判定ロジックを再現できる: getApps→guestSpaceId 指定 getApp", async () => {
    const { appId: normalAppId } = await createApp(BASE_URL, {
      name: "通常 app",
      spaceId: 1,
      threadId: 1,
    });
    const { appId: guestAppId } = await createApp(BASE_URL, {
      name: "ゲスト app",
      spaceId: 2,
      threadId: 2,
    });

    const baseClient = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    const apps = (await baseClient.app.getApps({})).apps;

    const probe = async (appId: string, spaceId: string) => {
      const guestClient = new KintoneRestAPIClient({
        baseUrl: BASE_URL,
        auth: { apiToken: "test" },
        guestSpaceId: Number(spaceId),
      });
      try {
        await guestClient.app.getApp({ id: appId });
        return true;
      } catch {
        return false;
      }
    };

    const results: Record<string, boolean> = {};
    for (const a of apps) {
      if (a.spaceId == null) continue;
      results[a.appId] = await probe(a.appId, a.spaceId);
    }

    expect(results[String(guestAppId)]).toBe(true);
    expect(results[String(normalAppId)]).toBe(false);
  });
});
