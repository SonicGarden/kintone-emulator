// 必須パラメーター欠落時に CB_VA01 を返すことを実 kintone と揃えて検証する。
// SDK は事前バリデーションするため、raw fetch で直接 API を叩く。

import { beforeEach, expect, test } from "vitest";
import { describeDualMode, getTestBaseUrl, getTestRequestHeaders, resetTestEnvironment } from "../real-kintone";

describeDualMode("必須パラメーター欠落時のレスポンス", () => {
  const SESSION = "required-params";
  let baseUrl: string;
  let headers: Record<string, string>;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    baseUrl = getTestBaseUrl(SESSION);
    headers = { ...getTestRequestHeaders(), "Accept-Language": "ja" };
  });

  const expectRequiredField = async (path: string, fieldName: string) => {
    const response = await fetch(`${baseUrl}${path}`, { headers });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors).toEqual({ [fieldName]: { messages: ["必須です。"] } });
  };

  test("GET /k/v1/records.json は app 欠落で CB_VA01", async () => {
    await expectRequiredField("/k/v1/records.json", "app");
  });

  test("GET /k/v1/records.json は app 空文字で CB_VA01", async () => {
    await expectRequiredField("/k/v1/records.json?app=", "app");
  });

  test("GET /k/v1/app/form/fields.json は app 欠落で CB_VA01", async () => {
    await expectRequiredField("/k/v1/app/form/fields.json", "app");
  });

  test("GET /k/v1/app/form/layout.json は app 欠落で CB_VA01", async () => {
    await expectRequiredField("/k/v1/app/form/layout.json", "app");
  });

  test("GET /k/v1/file.json は fileKey 欠落で CB_VA01", async () => {
    await expectRequiredField("/k/v1/file.json", "fileKey");
  });
});
