// dualMode で実 kintone と挙動を揃えるためのゲストスペース挙動テスト。
// 実機側は .env.real-kintone の VITE_KINTONE_TEST_SPACE_APP_IDS /
// VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS（spaceId:appId 形式）で指定された
// 既存のスペース・アプリを使う。エミュレーター側は同じ ID 構成を都度作る。

import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession, setupSpace } from "../../helpers";
import {
  describeDualMode,
  getTestAuth,
  getTestBaseUrl,
  getTestGuestSpaceApps,
  getTestRequestHeaders,
  getTestSpaceApps,
  isUsingRealKintone,
} from "../../real-kintone";

describeDualMode("ゲストスペース挙動 (dualMode)", () => {
  const SESSION = "guest-space-dual";
  let baseUrl: string;
  let client: KintoneRestAPIClient;
  let headers: Record<string, string>;
  let normalApp: { spaceId: number; appId: number };
  let guestApp: { spaceId: number; appId: number };

  beforeAll(() => {
    // 実 kintone モードでは env 必須。emulator モードでは fixture を都度作るので
    // 任意の ID を使えるが、env があればそれに合わせる。
    const space = getTestSpaceApps()[0];
    const guest = getTestGuestSpaceApps()[0];
    if (isUsingRealKintone() && (!space || !guest)) {
      throw new Error(
        "VITE_KINTONE_TEST_SPACE_APP_IDS / VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS を spaceId:appId 形式で指定してください",
      );
    }
    normalApp = space ?? { spaceId: 1, appId: 17 };
    guestApp = guest ?? { spaceId: 2, appId: 15 };
  });

  beforeEach(async () => {
    baseUrl = getTestBaseUrl(SESSION);
    client = new KintoneRestAPIClient({ baseUrl, auth: getTestAuth() });
    headers = { ...getTestRequestHeaders(), "Accept-Language": "ja" };

    if (!isUsingRealKintone()) {
      // emulator: 実機と同じ space/app 構成を都度セットアップ
      const url = createBaseUrl(SESSION);
      await finalizeSession(url);
      await initializeSession(url);
      await setupSpace(url, { id: normalApp.spaceId, isGuest: false });
      await setupSpace(url, { id: guestApp.spaceId, isGuest: true });
      await createApp(url, {
        id: normalApp.appId, name: "normal app",
        spaceId: normalApp.spaceId, threadId: normalApp.spaceId,
      });
      await createApp(url, {
        id: guestApp.appId, name: "guest app",
        spaceId: guestApp.spaceId, threadId: guestApp.spaceId,
      });
    }
  });

  test("getApps は spaceId / threadId を実値で返す", async () => {
    const result = await client.app.getApps({ ids: [guestApp.appId, normalApp.appId] });
    const byId = Object.fromEntries(result.apps.map((a) => [a.appId, a]));
    expect(byId[String(guestApp.appId)]).toMatchObject({
      spaceId: String(guestApp.spaceId),
    });
    expect(byId[String(normalApp.appId)]).toMatchObject({
      spaceId: String(normalApp.spaceId),
    });
  });

  test("非ゲストパスでゲスト app を getApp すると GAIA_IL23 (400)", async () => {
    const res = await fetch(`${baseUrl}/k/v1/app.json?id=${guestApp.appId}`, { headers });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("GAIA_IL23");
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
