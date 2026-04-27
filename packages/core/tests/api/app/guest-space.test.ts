// 実 kintone と挙動を揃えるためのゲストスペース挙動テスト (dualMode)。
// 実機側は .env.real-kintone の VITE_KINTONE_TEST_SPACE_APP_IDS /
// VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS（spaceId:appId 形式）で指定された
// 既存のスペース・アプリを使う。emulator は createTestSpaceApp が都度作る。

import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeAll, beforeEach, expect, test } from "vitest";
import {
  createTestSpaceApp,
  describeDualMode,
  getTestAuth,
  getTestBaseUrl,
  getTestRequestHeaders,
  resetTestEnvironment,
} from "../../real-kintone";

describeDualMode("ゲストスペース挙動", () => {
  const SESSION = "guest-space";
  let baseUrl: string;
  let client: KintoneRestAPIClient;
  let headers: Record<string, string>;
  let normalApp: Awaited<ReturnType<typeof createTestSpaceApp>>;
  let guestApp: Awaited<ReturnType<typeof createTestSpaceApp>>;

  beforeAll(() => {
    baseUrl = getTestBaseUrl(SESSION);
    client = new KintoneRestAPIClient({ baseUrl, auth: getTestAuth() });
    headers = { ...getTestRequestHeaders(), "Accept-Language": "ja" };
  });

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    normalApp = await createTestSpaceApp(SESSION, { kind: "space", name: "normal app" });
    guestApp = await createTestSpaceApp(SESSION, { kind: "guestSpace", name: "guest app" });
  });

  test("getApps は spaceId / threadId を実値で返す", async () => {
    const result = await client.app.getApps({ ids: [guestApp.appId, normalApp.appId] });
    const byId = Object.fromEntries(result.apps.map((a) => [a.appId, a]));
    expect(byId[String(guestApp.appId)]).toMatchObject({ spaceId: String(guestApp.spaceId) });
    expect(byId[String(normalApp.appId)]).toMatchObject({ spaceId: String(normalApp.spaceId) });
  });

  test("非ゲストパスでゲスト app を getApp すると GAIA_IL23 (400)", async () => {
    const res = await fetch(`${baseUrl}/k/v1/app.json?id=${guestApp.appId}`, { headers });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("GAIA_IL23");
    expect(json.message).toBe(
      "ゲストスペース内のアプリを操作する場合は、リクエストの送信先を「/k/guest/（ゲストスペースのID）/v1/...」にします。",
    );
  });

  test("ゲストパスで spaceId 一致のゲスト app は 200 で取得できる", async () => {
    const res = await fetch(
      `${baseUrl}/k/guest/${guestApp.spaceId}/v1/app.json?id=${guestApp.appId}`,
      { headers },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.appId).toBe(String(guestApp.appId));
    expect(json.spaceId).toBe(String(guestApp.spaceId));
  });

  test("ゲストパスで通常スペースのアプリを getApp すると CB_NO02 (403)", async () => {
    const res = await fetch(
      `${baseUrl}/k/guest/${guestApp.spaceId}/v1/app.json?id=${normalApp.appId}`,
      { headers },
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("CB_NO02");
    expect(json.message).toBe("権限がありません。");
  });

  test("非ゲストパスで getRecords しても GAIA_IL23 (400)", async () => {
    const res = await fetch(`${baseUrl}/k/v1/records.json?app=${guestApp.appId}`, { headers });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("GAIA_IL23");
  });

  test("ゲストパスで getRecords できる", async () => {
    const guestClient = new KintoneRestAPIClient({
      baseUrl, auth: getTestAuth(), guestSpaceId: guestApp.spaceId,
    });
    const result = await guestClient.record.getRecords({ app: guestApp.appId });
    expect(Array.isArray(result.records)).toBe(true);
  });

  test("非ゲストパスで getFormFields しても GAIA_IL23 (400)", async () => {
    const res = await fetch(`${baseUrl}/k/v1/app/form/fields.json?app=${guestApp.appId}`, { headers });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("GAIA_IL23");
  });

  test("ユーザー判定ロジック再現: getApps→guestSpaceId 指定で getApp", async () => {
    const probe = async (appId: number, spaceId: number) => {
      const guestClient = new KintoneRestAPIClient({
        baseUrl, auth: getTestAuth(), guestSpaceId: spaceId,
      });
      try {
        await guestClient.app.getApp({ id: appId });
        return true;
      } catch {
        return false;
      }
    };
    expect(await probe(guestApp.appId, guestApp.spaceId)).toBe(true);
    expect(await probe(normalApp.appId, normalApp.spaceId)).toBe(false);
  });
});
