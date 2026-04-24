import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  createBaseUrl,
  initializeSession,
  finalizeSession,
  createApp,
  setupAuth,
} from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

const SESSION = "auth-test";
let BASE_URL: string;

beforeAll(() => {
  BASE_URL = createBaseUrl(SESSION);
});

describeEmulatorOnly("パスワード認証", () => {
  beforeEach(async () => {
    await initializeSession(BASE_URL);
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("認証未設定時はヘッダーなしでアクセスできる", async () => {
    await createApp(BASE_URL, { name: "test" });
    const response = await fetch(`${BASE_URL}/k/v1/app.json?id=1`);
    expect(response.status).toBe(200);
  });

  test("正しいヘッダーでアクセスできる", async () => {
    await setupAuth(BASE_URL, "admin", "password");
    await createApp(BASE_URL, { name: "test" });
    const response = await fetch(`${BASE_URL}/k/v1/app.json?id=1`, {
      headers: {
        "X-Cybozu-Authorization": btoa("admin:password"),
      },
    });
    expect(response.status).toBe(200);
  });

  describe.each([
    {
      lang: "ja",
      loginMessage: "ログインしてください。",
      authFailMessage: "ユーザーのパスワード認証に失敗しました。「X-Cybozu-Authorization」ヘッダーの値が正しくありません。",
    },
    {
      lang: "en",
      loginMessage: "Please login.",
      authFailMessage: "Password authentication failed. The value in http header of X-Cybozu-Authorization is not valid.",
    },
  ])("Accept-Language: $lang", ({ lang, loginMessage, authFailMessage }) => {
    test("ヘッダーなしで 401 / CB_AU01 が返る", async () => {
      await setupAuth(BASE_URL, "admin", "password");
      const response = await fetch(`${BASE_URL}/k/v1/app.json?id=1`, {
        headers: { "Accept-Language": lang },
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe("CB_AU01");
      expect(body.message).toBe(loginMessage);
      expect(body.id).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("誤ったパスワードで 401 / CB_WA01 が返る", async () => {
      await setupAuth(BASE_URL, "admin", "password");
      const response = await fetch(`${BASE_URL}/k/v1/app.json?id=1`, {
        headers: {
          "Accept-Language": lang,
          "X-Cybozu-Authorization": btoa("admin:wrong"),
        },
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe("CB_WA01");
      expect(body.message).toBe(authFailMessage);
      expect(body.id).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("不正なBase64で 401 / CB_WA01 が返る", async () => {
      await setupAuth(BASE_URL, "admin", "password");
      const response = await fetch(`${BASE_URL}/k/v1/app.json?id=1`, {
        headers: {
          "Accept-Language": lang,
          "X-Cybozu-Authorization": "!!!invalid!!!",
        },
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe("CB_WA01");
      expect(body.message).toBe(authFailMessage);
      expect(body.id).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  test("レスポンスのidは毎回異なる", async () => {
    await setupAuth(BASE_URL, "admin", "password");
    const res1 = await fetch(`${BASE_URL}/k/v1/app.json?id=1`);
    const res2 = await fetch(`${BASE_URL}/k/v1/app.json?id=1`);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.id).not.toBe(body2.id);
  });

  test("setup/app.jsonは認証有効時でもヘッダー不要", async () => {
    await setupAuth(BASE_URL, "admin", "password");
    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    expect(response.status).toBe(200);
  });

  test("initializeは認証有効時でもヘッダー不要", async () => {
    await setupAuth(BASE_URL, "admin", "password");
    await finalizeSession(BASE_URL);
    const response = await fetch(`${BASE_URL}/initialize`, { method: "POST" });
    expect(response.status).toBe(200);
  });

  test("複数ユーザーを登録できる", async () => {
    await setupAuth(BASE_URL, "user1", "pass1");
    await setupAuth(BASE_URL, "user2", "pass2");
    await createApp(BASE_URL, { name: "test" });

    const res1 = await fetch(`${BASE_URL}/k/v1/app.json?id=1`, {
      headers: { "X-Cybozu-Authorization": btoa("user1:pass1") },
    });
    expect(res1.status).toBe(200);

    const res2 = await fetch(`${BASE_URL}/k/v1/app.json?id=1`, {
      headers: { "X-Cybozu-Authorization": btoa("user2:pass2") },
    });
    expect(res2.status).toBe(200);
  });
});
