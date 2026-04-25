import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

describeEmulatorOnly("Accept-Language によるメッセージ切り替え", () => {
  const SESSION = "record-locale-validation";
  let BASE_URL: string;
  let appId: number;

  beforeAll(() => { BASE_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    appId = await createApp(BASE_URL, {
      name: "locale テスト",
      properties: {
        req_text: { type: "SINGLE_LINE_TEXT", code: "req_text", label: "req", required: true, maxLength: "3", unique: true },
        num:      { type: "NUMBER",           code: "num",      label: "num", maxValue: "100", minValue: "10" },
        radio:    { type: "RADIO_BUTTON",     code: "radio",    label: "radio", options: { A: { label: "A", index: "0" } } },
      },
    });
  });
  afterEach(async () => { await finalizeSession(BASE_URL); });

  const postRecord = (lang: string | null, body: unknown) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (lang != null) headers["Accept-Language"] = lang;
    return fetch(`${BASE_URL}/k/v1/record.json`, { method: "POST", headers, body: JSON.stringify(body) });
  };

  test("Accept-Language: en のとき英語メッセージを返す", async () => {
    const r = await postRecord("en", { app: appId, record: {} });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.message).toBe("Missing or invalid input.");
    expect(json.errors["record.req_text.value"]).toEqual({ messages: ["Required."] });
  });

  test("Accept-Language: en-US も英語", async () => {
    const r = await postRecord("en-US,en;q=0.9", {
      app: appId,
      record: { req_text: { value: "toolong" }, num: { value: "150" }, radio: { value: "Z" } },
    });
    const json = await r.json();
    expect(json.errors["record.req_text.value"]).toEqual({ messages: ["Enter less than 4 characters."] });
    expect(json.errors["record.num.value"]).toEqual({ messages: ["The value must be 100 or less."] });
    expect(json.errors["record.radio.value"]).toEqual({ messages: ['The value, "Z", is not in options.'] });
  });

  test("Accept-Language: zh でも ja 以外なので英語", async () => {
    const r = await postRecord("zh-CN", { app: appId, record: { num: { value: "5" } } });
    const json = await r.json();
    expect(json.errors["record.num.value"]).toEqual({ messages: ["The value must be 10 or more."] });
  });

  test("Accept-Language: ja は日本語", async () => {
    const r = await postRecord("ja", { app: appId, record: { num: { value: "abc" } } });
    const json = await r.json();
    expect(json.message).toBe("入力内容が正しくありません。");
    expect(json.errors["record[num].value"]).toEqual({ messages: ["数字でなければなりません。"] });
  });

  test("unique 重複の英語メッセージ", async () => {
    await postRecord("en", { app: appId, record: { req_text: { value: "xyz" } } });
    const r = await postRecord("en", { app: appId, record: { req_text: { value: "xyz" } } });
    const json = await r.json();
    expect(json.errors["record.req_text.value"]).toEqual({
      messages: ["This value already exists in another record."],
    });
  });

  test("ヘッダー無しはデフォルトで日本語", async () => {
    const r = await postRecord(null, { app: appId, record: {} });
    const json = await r.json();
    expect(json.message).toBe("入力内容が正しくありません。");
    expect(json.errors["record.req_text.value"]).toEqual({ messages: ["必須です。"] });
  });
});

