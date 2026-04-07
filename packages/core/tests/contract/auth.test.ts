import { describe, expect, test } from "vitest";

const DOMAIN = process.env.KINTONE_TEST_DOMAIN;
const USER = process.env.KINTONE_TEST_USER;
const PASSWORD = process.env.KINTONE_TEST_PASSWORD;

const hasCredentials = DOMAIN && USER && PASSWORD;

const BASE_URL = hasCredentials ? `https://${DOMAIN}.cybozu.com` : "";

const fetchWithLang = (url: string, lang: string, headers?: Record<string, string>) =>
  fetch(url, { headers: { "Accept-Language": lang, ...headers } });

describe.skipIf(!hasCredentials)("kintone実環境の認証レスポンス契約テスト", () => {
  describe.each([
    { lang: "ja", loginMessage: "ログインしてください。", authFailMessage: "ユーザーのパスワード認証に失敗しました。「X-Cybozu-Authorization」ヘッダーの値が正しくありません。" },
    { lang: "en", loginMessage: "Please login.", authFailMessage: "Password authentication failed. The value in http header of X-Cybozu-Authorization is not valid." },
  ])("Accept-Language: $lang", ({ lang, loginMessage, authFailMessage }) => {
    test("認証ヘッダーなしで 401 / CB_AU01 が返る", async () => {
      const response = await fetchWithLang(`${BASE_URL}/k/v1/app.json?id=1`, lang);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe("CB_AU01");
      expect(body.message).toBe(loginMessage);
      expect(body).toHaveProperty("id");
    });

    test("誤ったパスワードで 401 / CB_WA01 が返る", async () => {
      const response = await fetchWithLang(`${BASE_URL}/k/v1/app.json?id=1`, lang, {
        "X-Cybozu-Authorization": btoa(`${USER}:wrongpassword`),
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe("CB_WA01");
      expect(body.message).toBe(authFailMessage);
      expect(body).toHaveProperty("id");
    });
  });

  test("正しい認証情報で 200 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/app.json?id=1`, {
      headers: {
        "X-Cybozu-Authorization": btoa(`${USER}:${PASSWORD}`),
      },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.appId).toBe("1");
  });
});
