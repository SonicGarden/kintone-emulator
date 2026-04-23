import { KintoneRestAPIClient, KintoneRestAPIError } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("record-test-session");
});

describe("アプリのレコードAPI", () => {
  let client: KintoneRestAPIClient | undefined = undefined;
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: {
        apiToken: "test",
      },
    });
    await client.app.addFormFields({
      app: 1,
      properties: {
        test: {
          type: "SINGLE_LINE_TEXT",
          code: "test",
          label: "Test",
        },
      },
    });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("アプリにレコードを追加し、変更し、検索できる", async () => {
    const result = await client!.record.addRecord({
      app: 1,
      record: {
        test: {
          value: "test",
        },
      },
    });
    expect(result).toEqual({
      id: expect.any(String),
      revision: "1",
    });
    const record = await client!.record.getRecord({
      app: 1,
      id: result.id,
    });
    expect(record).toEqual({
      record: {
        $id: {
          value: result.id,
          type: "RECORD_NUMBER",
        },
        $revision: {
          value: "1",
          type: "__REVISION__",
        },
        test: {
          value: "test",
          type: "SINGLE_LINE_TEXT",
        },
      },
    });
    await client!.record.updateRecord({
      app: 1,
      id: result.id,
      record: {
        test: {
          value: "test2",
        },
      },
    });
    const updatedRecord = await client!.record.getRecord({
      app: 1,
      id: result.id,
    });
    expect(updatedRecord).toEqual({
      record: {
        $id: {
          value: result.id,
          type: "RECORD_NUMBER",
        },
        $revision: {
          value: "2",
          type: "__REVISION__",
        },
        test: {
          value: "test2",
          type: "SINGLE_LINE_TEXT",
        },
      },
    });
  });

  test("存在しないレコードをGETすると404が返る", async () => {
    // KintoneRestAPIClient は 4xx でエラーをthrowするため、ステータスコードを直接検証するために fetch を使用する
    const response = await fetch(`${BASE_URL}/k/v1/record.json?app=1&id=99999`);
    expect(response.status).toBe(404);
  });

  test("存在しないレコードをPUTすると404が返る", async () => {
    // KintoneRestAPIClient は 4xx でエラーをthrowするため、ステータスコードを直接検証するために fetch を使用する
    const response = await fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: 1,
        id: "99999",
        record: { test: { value: "test" } },
      }),
    });
    expect(response.status).toBe(404);
  });

  test("setup/app.json の records でレコードを一括作成できる", async () => {
    const appId = await createApp(BASE_URL, {
      name: "レコード付きアプリ",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      records: [
        { title: { value: "レコード1" } },
        { title: { value: "レコード2" } },
      ],
    });

    const records = await client!.record.getRecords({ app: appId, query: "order by $id asc" });
    expect(records.records).toHaveLength(2);
    expect(records.records[0]!.title).toEqual({ value: "レコード1", type: "SINGLE_LINE_TEXT" });
    expect(records.records[1]!.title).toEqual({ value: "レコード2", type: "SINGLE_LINE_TEXT" });
  });

  test("setup/app.json の records で $id を指定するとレコード ID が維持される", async () => {
    const appId = await createApp(BASE_URL, {
      name: "ID指定レコードアプリ",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      records: [
        { $id: { value: "100" }, title: { value: "レコード100" } },
        { $id: { value: "200" }, title: { value: "レコード200" } },
      ],
    });

    const record100 = await client!.record.getRecord({ app: appId, id: 100 });
    expect(record100.record.$id).toEqual({ value: "100", type: "RECORD_NUMBER" });
    expect(record100.record.title).toEqual({ value: "レコード100", type: "SINGLE_LINE_TEXT" });

    const record200 = await client!.record.getRecord({ app: appId, id: 200 });
    expect(record200.record.$id).toEqual({ value: "200", type: "RECORD_NUMBER" });
    expect(record200.record.title).toEqual({ value: "レコード200", type: "SINGLE_LINE_TEXT" });
  });

  test("records で重複する $id を指定するとエラーが返る", async () => {
    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "重複レコードIDアプリ",
        records: [
          { $id: { value: "100" }, title: { value: "レコード100" } },
          { $id: { value: "100" }, title: { value: "重複レコード" } },
        ],
      }),
    });
    expect(response.status).toBe(400);
  });

  test("異なるアプリのレコード ID はそれぞれ1から始まる", async () => {
    const app1 = await createApp(BASE_URL, {
      name: "アプリ1",
      properties: { field1: { type: "SINGLE_LINE_TEXT", code: "field1", label: "フィールド1" } },
    });
    const app2 = await createApp(BASE_URL, {
      name: "アプリ2",
      properties: { field2: { type: "SINGLE_LINE_TEXT", code: "field2", label: "フィールド2" } },
    });

    const result1 = await client!.record.addRecord({
      app: app1,
      record: { field1: { value: "アプリ1のレコード" } },
    });
    const result2 = await client!.record.addRecord({
      app: app2,
      record: { field2: { value: "アプリ2のレコード" } },
    });

    expect(result1.id).toBe("1");
    expect(result2.id).toBe("1");

    // 各アプリのレコードが独立して取得できることを検証
    const record1 = await client!.record.getRecord({ app: app1, id: 1 });
    expect(record1.record.field1).toEqual({ value: "アプリ1のレコード", type: "SINGLE_LINE_TEXT" });

    const record2 = await client!.record.getRecord({ app: app2, id: 1 });
    expect(record2.record.field2).toEqual({ value: "アプリ2のレコード", type: "SINGLE_LINE_TEXT" });
  });

  test("削除されたレコードの ID は再利用されない", async () => {
    const result1 = await client!.record.addRecord({
      app: 1,
      record: { test: { value: "first" } },
    });
    expect(result1.id).toBe("1");

    await client!.record.deleteRecords({ app: 1, ids: [result1.id] });

    const result2 = await client!.record.addRecord({
      app: 1,
      record: { test: { value: "second" } },
    });
    expect(result2.id).toBe("2");
  });

  test("日本語のフィールドを持つキーで更新をかける", async () => {
    const result = await client!.record.addRecord({
      app: 1,
      record: {
        レコード番号: {
          value: "test",
        },
        内容: {
          value: "test",
        },
      },
    });
    await client!.record.updateRecord({
      app: 1,
      updateKey: { field: "レコード番号", value: "test" },
      record: {
        内容: {
          value: "test2",
        },
      },
    });
    const updatedRecord = await client!.record.getRecord({
      app: 1,
      id: result.id,
    });
    expect(updatedRecord).toEqual({
      record: {
        $id: {
          value: result.id,
          type: "RECORD_NUMBER",
        },
        $revision: {
          value: "2",
          type: "__REVISION__",
        },
        レコード番号: {
          value: "test",
        },
        内容: {
          value: "test2",
        },
      },
    });
  });
});

describe("required フィールドのバリデーション", () => {
  const SESSION = "record-required-validation";
  let BASE_URL: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => {
    BASE_URL = createBaseUrl(SESSION);
  });

  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });
    appId = await createApp(BASE_URL, {
      name: "必須テストアプリ",
      properties: {
        req_text:   { type: "SINGLE_LINE_TEXT", code: "req_text",   label: "必須テキスト", required: true },
        opt_text:   { type: "SINGLE_LINE_TEXT", code: "opt_text",   label: "任意テキスト", required: false },
        req_check:  { type: "CHECK_BOX",        code: "req_check",  label: "必須チェック", required: true,
                      options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        req_user:   { type: "USER_SELECT",      code: "req_user",   label: "必須ユーザー", required: true },
      },
    });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  const postRecord = (body: unknown) =>
    fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const putRecord = (body: unknown) =>
    fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  test("required フィールドを省略して POST すると 400 が返る", async () => {
    const response = await postRecord({ app: appId, record: {} });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.message).toBe("入力内容が正しくありません。");
    expect(json.errors).toEqual({
      "record.req_text.value":  { messages: ["必須です。"] },
      "record.req_check.values": { messages: ["必須です。"] },
      "record.req_user.values.value": { messages: ["必須です。"] },
    });
  });

  test("required の SINGLE_LINE_TEXT に空文字を渡すと 400", async () => {
    const response = await postRecord({
      app: appId,
      record: {
        req_text:  { value: "" },
        req_check: { value: ["A"] },
        req_user:  { value: [{ code: "u1" }] },
      },
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors).toEqual({
      "record.req_text.value": { messages: ["必須です。"] },
    });
  });

  test("required の CHECK_BOX に空配列を渡すと 400", async () => {
    const response = await postRecord({
      app: appId,
      record: {
        req_text:  { value: "x" },
        req_check: { value: [] },
        req_user:  { value: [{ code: "u1" }] },
      },
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors).toEqual({
      "record.req_check.values": { messages: ["必須です。"] },
    });
  });

  test("required の USER_SELECT に空配列を渡すと 400", async () => {
    const response = await postRecord({
      app: appId,
      record: {
        req_text:  { value: "x" },
        req_check: { value: ["A"] },
        req_user:  { value: [] },
      },
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors).toEqual({
      "record.req_user.values.value": { messages: ["必須です。"] },
    });
  });

  test("required をすべて埋めれば成功し、required でない opt_text は省略可", async () => {
    const result = await client.record.addRecord({
      app: appId,
      record: {
        req_text:  { value: "x" },
        req_check: { value: ["A"] },
        req_user:  { value: [{ code: "u1" }] },
      },
    });
    expect(result).toEqual({ id: expect.any(String), revision: "1" });
  });

  test("@kintone/rest-api-client 経由でも errors にアクセスできる", async () => {
    expect.assertions(3);
    try {
      await client.record.addRecord({ app: appId, record: {} });
    } catch (e) {
      expect(e).toBeInstanceOf(KintoneRestAPIError);
      const err = e as KintoneRestAPIError;
      expect(err.code).toBe("CB_VA01");
      expect(err.errors).toMatchObject({
        "record.req_text.value": { messages: ["必須です。"] },
      });
    }
  });

  test("既存レコードの required を残して別フィールドだけ更新する PUT は成功", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: {
        req_text:  { value: "x" },
        req_check: { value: ["A"] },
        req_user:  { value: [{ code: "u1" }] },
      },
    });
    const result = await client.record.updateRecord({
      app: appId,
      id,
      record: { opt_text: { value: "hello" } },
    });
    expect(result.revision).toBe("2");
  });

  test("PUT で required フィールドを空文字に更新すると 400", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: {
        req_text:  { value: "x" },
        req_check: { value: ["A"] },
        req_user:  { value: [{ code: "u1" }] },
      },
    });
    const response = await putRecord({
      app: appId,
      id,
      record: { req_text: { value: "" } },
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors).toEqual({
      "record.req_text.value": { messages: ["必須です。"] },
    });
  });
});

describe("unique フィールドのバリデーション", () => {
  const SESSION = "record-unique-validation";
  let BASE_URL: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => {
    BASE_URL = createBaseUrl(SESSION);
  });

  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    appId = await createApp(BASE_URL, {
      name: "unique テスト",
      properties: {
        uniq_text: { type: "SINGLE_LINE_TEXT", code: "uniq_text", label: "ユニークテキスト", unique: true },
        opt_text:  { type: "SINGLE_LINE_TEXT", code: "opt_text",  label: "任意テキスト" },
      },
    });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  const postRecord = (body: unknown) =>
    fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  const putRecord = (body: unknown) =>
    fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

  test("重複する値を POST すると 400", async () => {
    await client.record.addRecord({ app: appId, record: { uniq_text: { value: "abc" } } });
    const response = await postRecord({ app: appId, record: { uniq_text: { value: "abc" } } });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors).toEqual({
      "record.uniq_text.value": { messages: ["値がほかのレコードと重複しています。"] },
    });
  });

  test("空文字は重複扱いされない", async () => {
    await client.record.addRecord({ app: appId, record: { uniq_text: { value: "" } } });
    const res = await client.record.addRecord({ app: appId, record: { uniq_text: { value: "" } } });
    expect(res.id).toBeTruthy();
  });

  test("PUT は自レコード自身との重複を許す", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { uniq_text: { value: "abc" } } });
    const result = await client.record.updateRecord({
      app: appId, id, record: { uniq_text: { value: "abc" }, opt_text: { value: "touched" } },
    });
    expect(result.revision).toBe("2");
  });

  test("PUT で他レコードの値と重複すると 400", async () => {
    await client.record.addRecord({ app: appId, record: { uniq_text: { value: "abc" } } });
    const { id } = await client.record.addRecord({ app: appId, record: { uniq_text: { value: "def" } } });
    const response = await putRecord({
      app: appId, id, record: { uniq_text: { value: "abc" } },
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors).toEqual({
      "record.uniq_text.value": { messages: ["値がほかのレコードと重複しています。"] },
    });
  });
});

describe("maxLength / minLength バリデーション", () => {
  const SESSION = "record-length-validation";
  let BASE_URL: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => { BASE_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    appId = await createApp(BASE_URL, {
      name: "length テスト",
      properties: {
        text:  { type: "SINGLE_LINE_TEXT", code: "text",  label: "text",  maxLength: "5", minLength: "2" },
        multi: { type: "MULTI_LINE_TEXT",  code: "multi", label: "multi", maxLength: "10" },
        link:  { type: "LINK",              code: "link",  label: "link",  minLength: "3", protocol: "WEB" },
      },
    });
  });
  afterEach(async () => { await finalizeSession(BASE_URL); });

  const postRecord = (body: unknown) =>
    fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

  test("maxLength 超過で 400", async () => {
    const response = await postRecord({ app: appId, record: { text: { value: "123456" } } });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.errors["record.text.value"]).toEqual({
      messages: ["6文字より短くなければなりません。"],
    });
  });

  test("minLength 未満で 400（空文字はスキップ）", async () => {
    const r1 = await postRecord({ app: appId, record: { text: { value: "x" } } });
    expect(r1.status).toBe(400);
    const j1 = await r1.json();
    expect(j1.errors["record.text.value"]).toEqual({
      messages: ["1文字より長くなければなりません。"],
    });
    // 空文字は minLength エラーにならない
    const r2 = await client.record.addRecord({ app: appId, record: { text: { value: "" } } });
    expect(r2.id).toBeTruthy();
  });

  test("範囲内なら成功 / MULTI_LINE_TEXT の maxLength も効く", async () => {
    const ok = await client.record.addRecord({ app: appId, record: { text: { value: "abc" } } });
    expect(ok.id).toBeTruthy();
    const ng = await postRecord({ app: appId, record: { multi: { value: "12345678901" } } });
    expect(ng.status).toBe(400);
    const json = await ng.json();
    expect(json.errors["record.multi.value"]).toEqual({
      messages: ["11文字より短くなければなりません。"],
    });
  });

  test("LINK の minLength も効く", async () => {
    const r = await postRecord({ app: appId, record: { link: { value: "ab" } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors["record.link.value"]).toEqual({
      messages: ["2文字より長くなければなりません。"],
    });
  });
});

describe("maxValue / minValue バリデーション", () => {
  const SESSION = "record-range-validation";
  let BASE_URL: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => { BASE_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    appId = await createApp(BASE_URL, {
      name: "range テスト",
      properties: {
        num: { type: "NUMBER", code: "num", label: "数値", maxValue: "100", minValue: "10" },
      },
    });
  });
  afterEach(async () => { await finalizeSession(BASE_URL); });

  const postRecord = (body: unknown) =>
    fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

  test("maxValue 超過で 400", async () => {
    const r = await postRecord({ app: appId, record: { num: { value: "150" } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors["record.num.value"]).toEqual({
      messages: ["100以下である必要があります。"],
    });
  });

  test("minValue 未満で 400", async () => {
    const r = await postRecord({ app: appId, record: { num: { value: "5" } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors["record.num.value"]).toEqual({
      messages: ["10以上である必要があります。"],
    });
  });

  test("数値以外で 400、キーはブラケット記法", async () => {
    const r = await postRecord({ app: appId, record: { num: { value: "abc" } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors["record[num].value"]).toEqual({
      messages: ["数字でなければなりません。"],
    });
  });

  test("範囲内なら成功", async () => {
    const r = await client.record.addRecord({ app: appId, record: { num: { value: "50" } } });
    expect(r.id).toBeTruthy();
  });
});

describe("options 整合バリデーション", () => {
  const SESSION = "record-options-validation";
  let BASE_URL: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => { BASE_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    appId = await createApp(BASE_URL, {
      name: "options テスト",
      properties: {
        radio: { type: "RADIO_BUTTON", code: "radio", label: "radio", options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        drop:  { type: "DROP_DOWN",    code: "drop",  label: "drop",  options: { X: { label: "X", index: "0" }, Y: { label: "Y", index: "1" } } },
        check: { type: "CHECK_BOX",    code: "check", label: "check", options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        multi: { type: "MULTI_SELECT", code: "multi", label: "multi", options: { P: { label: "P", index: "0" }, Q: { label: "Q", index: "1" } } },
      },
    });
  });
  afterEach(async () => { await finalizeSession(BASE_URL); });

  const postRecord = (body: unknown) =>
    fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

  test("RADIO_BUTTON で選択肢外を送ると 400", async () => {
    const r = await postRecord({ app: appId, record: { radio: { value: "Z" } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors["record.radio.value"]).toEqual({
      messages: ['"Z"は選択肢にありません。'],
    });
  });

  test("DROP_DOWN で選択肢外を送ると 400", async () => {
    const r = await postRecord({ app: appId, record: { drop: { value: "Q" } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors["record.drop.value"]).toEqual({
      messages: ['"Q"は選択肢にありません。'],
    });
  });

  test("CHECK_BOX で選択肢外を送ると index 付きキーで 400", async () => {
    const r = await postRecord({ app: appId, record: { check: { value: ["A", "Z"] } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors["record.check.values[1].value"]).toEqual({
      messages: ['"Z"は選択肢にありません。'],
    });
  });

  test("MULTI_SELECT で複数の選択肢外を送ると複数の errors キー", async () => {
    const r = await postRecord({ app: appId, record: { multi: { value: ["X", "Y"] } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors).toMatchObject({
      "record.multi.values[0].value": { messages: ['"X"は選択肢にありません。'] },
      "record.multi.values[1].value": { messages: ['"Y"は選択肢にありません。'] },
    });
  });

  test("空文字の RADIO_BUTTON は検証スキップ", async () => {
    const r = await client.record.addRecord({ app: appId, record: { radio: { value: "" } } });
    expect(r.id).toBeTruthy();
  });

  test("空配列の CHECK_BOX は options 整合検証をスキップ", async () => {
    const r = await client.record.addRecord({ app: appId, record: { check: { value: [] } } });
    expect(r.id).toBeTruthy();
  });
});

describe("Accept-Language によるメッセージ切り替え", () => {
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

describe("defaultValue / defaultNowValue の自動補完", () => {
  const SESSION = "record-default-value";
  let BASE_URL: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => { BASE_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    appId = await createApp(BASE_URL, {
      name: "default テスト",
      properties: {
        txt:   { type: "SINGLE_LINE_TEXT", code: "txt",   label: "txt",   defaultValue: "デフォルト" },
        num:   { type: "NUMBER",           code: "num",   label: "num",   defaultValue: "42" },
        radio: { type: "RADIO_BUTTON",     code: "radio", label: "radio", defaultValue: "B",
                 options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        check: { type: "CHECK_BOX",        code: "check", label: "check", defaultValue: ["A", "B"],
                 options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        date_def: { type: "DATE", code: "date_def", label: "dd", defaultValue: "2020-01-15" },
        date_now: { type: "DATE", code: "date_now", label: "dn", defaultNowValue: true },
        dt_now:   { type: "DATETIME", code: "dt_now", label: "dtn", defaultNowValue: true },
        time_now: { type: "TIME", code: "time_now", label: "tn", defaultNowValue: true },
        req_with_def: { type: "SINGLE_LINE_TEXT", code: "req_with_def", label: "rwd", required: true, defaultValue: "fallback" },
      },
    });
  });
  afterEach(async () => { await finalizeSession(BASE_URL); });

  const postRecord = (body: unknown) =>
    fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

  test("未送信フィールドは defaultValue で補完される", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: {} });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.txt).toMatchObject({ value: "デフォルト" });
    expect(record.num).toMatchObject({ value: "42" });
    expect(record.radio).toMatchObject({ value: "B" });
    expect(record.check).toMatchObject({ value: ["A", "B"] });
    expect(record.date_def).toMatchObject({ value: "2020-01-15" });
  });

  test("defaultNowValue が DATE / DATETIME / TIME で補完される", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: {} });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.date_now!.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(record.dt_now!.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
    expect(record.time_now!.value).toMatch(/^\d{2}:\d{2}$/);
  });

  test("required + defaultValue は値を送らなくても成功", async () => {
    const r = await postRecord({ app: appId, record: {} });
    expect(r.status).toBe(200);
    const { id } = await r.json();
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.req_with_def).toMatchObject({ value: "fallback" });
  });

  test('value:"" で送ったら defaultValue は適用されない（required なら 400）', async () => {
    const r = await postRecord({ app: appId, record: { req_with_def: { value: "" } } });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors["record.req_with_def.value"]).toEqual({ messages: ["必須です。"] });
  });

  test("value:[] で送ったら defaultValue は適用されない（空配列として保存）", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { check: { value: [] } } });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.check).toMatchObject({ value: [] });
  });

  test("明示的な値を送ったら defaultValue は上書きされない", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { txt: { value: "明示" }, num: { value: "100" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.txt).toMatchObject({ value: "明示" });
    expect(record.num).toMatchObject({ value: "100" });
    // 送っていないフィールドは defaultValue で補完される
    expect(record.radio).toMatchObject({ value: "B" });
  });

  test("PUT（更新）では defaultValue は適用されない", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { txt: { value: "初期" } },
    });
    // PUT で txt を明示的に削除するのは API 上できないので、別フィールドだけ更新して
    // 既存の txt 値がそのまま残る（defaultValue で上書きされない）ことを確認
    await client.record.updateRecord({ app: appId, id, record: { num: { value: "999" } } });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.txt).toMatchObject({ value: "初期" });
  });

  test("setup/app.json の records 一括投入でも defaultValue が適用される", async () => {
    const otherAppId = await createApp(BASE_URL, {
      name: "setup default テスト",
      properties: {
        a: { type: "SINGLE_LINE_TEXT", code: "a", label: "a", defaultValue: "fallback-a" },
        b: { type: "SINGLE_LINE_TEXT", code: "b", label: "b", defaultValue: "fallback-b" },
      },
      records: [
        {},                          // 全て defaultValue
        { a: { value: "明示" } },     // a は明示値、b は defaultValue
      ],
    });
    const { records } = await client.record.getRecords({ app: otherAppId, query: "order by $id asc" });
    expect(records[0]!.a).toMatchObject({ value: "fallback-a" });
    expect(records[0]!.b).toMatchObject({ value: "fallback-b" });
    expect(records[1]!.a).toMatchObject({ value: "明示" });
    expect(records[1]!.b).toMatchObject({ value: "fallback-b" });
  });
});
