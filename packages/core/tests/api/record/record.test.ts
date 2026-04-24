import { KintoneRestAPIClient, KintoneRestAPIError } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { createTestApp, describeDualMode, describeEmulatorOnly, getTestClient, resetTestEnvironment, testEmulatorOnly } from "../../real-kintone";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("record-test-session");
});

describeDualMode("アプリのレコードAPI", () => {
  const SESSION = "record-basic";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "record basic",
      properties: {
        test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" },
      },
    }));
  });

  test("アプリにレコードを追加し、変更し、検索できる", async () => {
    const result = await client.record.addRecord({
      app: appId,
      record: { test: { value: "test" } },
    });
    expect(result).toMatchObject({ id: expect.any(String), revision: "1" });
    const record = await client.record.getRecord({ app: appId, id: result.id });
    expect(record.record.$id).toEqual({ value: result.id, type: "__ID__" });
    expect(record.record.$revision).toEqual({ value: "1", type: "__REVISION__" });
    expect(record.record.test).toEqual({ value: "test", type: "SINGLE_LINE_TEXT" });

    await client.record.updateRecord({
      app: appId, id: result.id, record: { test: { value: "test2" } },
    });
    const updatedRecord = await client.record.getRecord({ app: appId, id: result.id });
    expect(updatedRecord.record.$revision).toEqual({ value: "2", type: "__REVISION__" });
    expect(updatedRecord.record.test).toEqual({ value: "test2", type: "SINGLE_LINE_TEXT" });
  });

  test("存在しないレコードをGETすると GAIA_RE01 が返る", async () => {
    // KintoneRestAPIError.message は `[404] [GAIA_RE01] ...` 形式なので code だけチェック
    await expect(
      client.record.getRecord({ app: appId, id: 99999 }),
    ).rejects.toMatchObject({ code: "GAIA_RE01" });
  });

  test("存在しないレコードをPUTすると GAIA_RE01 が返る", async () => {
    await expect(
      client.record.updateRecord({
        app: appId, id: 99999, record: { test: { value: "test" } },
      }),
    ).rejects.toMatchObject({ code: "GAIA_RE01" });
  });

  test("setup（createTestApp / records 指定）でレコードを一括作成できる", async () => {
    const { appId: otherAppId } = await createTestApp(SESSION, {
      name: "レコード付きアプリ",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      records: [
        { title: { value: "レコード1" } },
        { title: { value: "レコード2" } },
      ],
    });
    const records = await client.record.getRecords({ app: otherAppId, query: "order by $id asc" });
    expect(records.records).toHaveLength(2);
    expect(records.records[0]!.title).toEqual({ value: "レコード1", type: "SINGLE_LINE_TEXT" });
    expect(records.records[1]!.title).toEqual({ value: "レコード2", type: "SINGLE_LINE_TEXT" });
  });
});

// 以下はエミュレーター固有の挙動（raw fetch / /setup/app.json / 逐次 ID / 未定義フィールドの許容など）
describeEmulatorOnly("アプリのレコードAPI（emulator 固有）", () => {
  let client: KintoneRestAPIClient | undefined = undefined;
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({
      baseUrl: BASE_URL,
      auth: { apiToken: "test" },
    });
    await client.app.addFormFields({
      app: 1,
      properties: {
        test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" },
      },
    });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("パラメーター欠落（id）で CB_VA01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/record.json?app=1`);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors).toEqual({ id: { messages: ["必須です。"] } });
  });

  test("Accept-Language: en で英語の GAIA_RE01 が返る", async () => {
    const response = await fetch(`${BASE_URL}/k/v1/record.json?app=1&id=99999`, {
      headers: { "Accept-Language": "en" },
    });
    const json = await response.json();
    expect(json.message).toBe("The specified record (ID: 99999) is not found.");
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
    expect(record100.record.$id).toEqual({ value: "100", type: "__ID__" });
    expect(record100.record.title).toEqual({ value: "レコード100", type: "SINGLE_LINE_TEXT" });

    const record200 = await client!.record.getRecord({ app: appId, id: 200 });
    expect(record200.record.$id).toEqual({ value: "200", type: "__ID__" });
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
        レコード番号: { value: "test" },
        内容: { value: "test" },
      },
    });
    await client!.record.updateRecord({
      app: 1,
      updateKey: { field: "レコード番号", value: "test" },
      record: { 内容: { value: "test2" } },
    });
    const updatedRecord = await client!.record.getRecord({ app: 1, id: result.id });
    expect(updatedRecord.record.レコード番号).toMatchObject({ value: "test" });
    expect(updatedRecord.record.内容).toMatchObject({ value: "test2" });
  });
});

describeEmulatorOnly("required フィールドのバリデーション", () => {
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

describeDualMode("unique フィールドのバリデーション", () => {
  const SESSION = "record-unique-validation";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "unique テスト",
      properties: {
        uniq_text: { type: "SINGLE_LINE_TEXT", code: "uniq_text", label: "ユニークテキスト", unique: true },
        opt_text:  { type: "SINGLE_LINE_TEXT", code: "opt_text",  label: "任意テキスト" },
      },
    }));
  });

  test("重複する値を POST すると 400", async () => {
    await client.record.addRecord({ app: appId, record: { uniq_text: { value: "abc" } } });
    await expect(
      client.record.addRecord({ app: appId, record: { uniq_text: { value: "abc" } } }),
    ).rejects.toMatchObject({
      code: "CB_VA01",
      errors: { "record.uniq_text.value": { messages: ["値がほかのレコードと重複しています。"] } },
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
    await expect(
      client.record.updateRecord({ app: appId, id, record: { uniq_text: { value: "abc" } } }),
    ).rejects.toMatchObject({
      errors: { "record.uniq_text.value": { messages: ["値がほかのレコードと重複しています。"] } },
    });
  });
});

describeDualMode("maxLength / minLength バリデーション", () => {
  const SESSION = "record-length-validation";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "length テスト",
      properties: {
        text:  { type: "SINGLE_LINE_TEXT", code: "text",  label: "text",  maxLength: "5", minLength: "2" },
      },
    }));
  });

  test("maxLength 超過で 400", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { text: { value: "123456" } } }),
    ).rejects.toMatchObject({
      errors: { "record.text.value": { messages: ["6文字より短くなければなりません。"] } },
    });
  });

  test("minLength 未満で 400", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { text: { value: "x" } } }),
    ).rejects.toMatchObject({
      errors: { "record.text.value": { messages: ["1文字より長くなければなりません。"] } },
    });
  });
});

// TODO: dualMode 化は実機との挙動差分の確認が必要
// - 空文字は minLength 検証をスキップするか（実機は unclear）
// - LINK minLength と同時に URL 形式エラーが出る
// - MULTI_LINE_TEXT の maxLength 検証の詳細
describeEmulatorOnly("maxLength / minLength バリデーション（実機差分あり）", () => {
  const SESSION = "record-length-validation-edge";
  let BASE_URL: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => { BASE_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    appId = await createApp(BASE_URL, {
      name: "length テスト edge",
      properties: {
        text:  { type: "SINGLE_LINE_TEXT", code: "text",  label: "text",  maxLength: "5", minLength: "2" },
        multi: { type: "MULTI_LINE_TEXT",  code: "multi", label: "multi", maxLength: "10" },
        link:  { type: "LINK",              code: "link",  label: "link",  minLength: "3", protocol: "WEB" },
      },
    });
  });
  afterEach(async () => { await finalizeSession(BASE_URL); });

  test("空文字は minLength エラーにならない（emulator）", async () => {
    const r2 = await client.record.addRecord({ app: appId, record: { text: { value: "" } } });
    expect(r2.id).toBeTruthy();
  });

  test("範囲内なら成功 / MULTI_LINE_TEXT の maxLength も効く", async () => {
    const ok = await client.record.addRecord({ app: appId, record: { text: { value: "abc" } } });
    expect(ok.id).toBeTruthy();
    await expect(
      client.record.addRecord({ app: appId, record: { multi: { value: "12345678901" } } }),
    ).rejects.toMatchObject({
      errors: { "record.multi.value": { messages: ["11文字より短くなければなりません。"] } },
    });
  });

  test("LINK の minLength も効く（emulator は URL 形式エラーなし）", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { link: { value: "ab" } } }),
    ).rejects.toMatchObject({
      errors: { "record.link.value": { messages: ["2文字より長くなければなりません。"] } },
    });
  });
});

describeDualMode("maxValue / minValue バリデーション", () => {
  const SESSION = "record-range-validation";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "range テスト",
      properties: {
        num: { type: "NUMBER", code: "num", label: "数値", maxValue: "100", minValue: "10" },
      },
    }));
  });

  test("maxValue 超過で 400", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { num: { value: "150" } } }),
    ).rejects.toMatchObject({
      errors: { "record.num.value": { messages: ["100以下である必要があります。"] } },
    });
  });

  test("minValue 未満で 400", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { num: { value: "5" } } }),
    ).rejects.toMatchObject({
      errors: { "record.num.value": { messages: ["10以上である必要があります。"] } },
    });
  });

  test("数値以外で 400、キーはブラケット記法", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { num: { value: "abc" } } }),
    ).rejects.toMatchObject({
      errors: { "record[num].value": { messages: ["数字でなければなりません。"] } },
    });
  });

  test("範囲内なら成功", async () => {
    const r = await client.record.addRecord({ app: appId, record: { num: { value: "50" } } });
    expect(r.id).toBeTruthy();
  });
});

describeDualMode("options 整合バリデーション", () => {
  const SESSION = "record-options-validation";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "options テスト",
      properties: {
        radio: { type: "RADIO_BUTTON", code: "radio", label: "radio", options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        drop:  { type: "DROP_DOWN",    code: "drop",  label: "drop",  options: { X: { label: "X", index: "0" }, Y: { label: "Y", index: "1" } } },
        check: { type: "CHECK_BOX",    code: "check", label: "check", options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
        multi: { type: "MULTI_SELECT", code: "multi", label: "multi", options: { P: { label: "P", index: "0" }, Q: { label: "Q", index: "1" } } },
      },
    }));
  });

  test("RADIO_BUTTON で選択肢外を送ると 400", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { radio: { value: "Z" } } }),
    ).rejects.toMatchObject({
      errors: { "record.radio.value": { messages: ['"Z"は選択肢にありません。'] } },
    });
  });

  test("DROP_DOWN で選択肢外を送ると 400", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { drop: { value: "Q" } } }),
    ).rejects.toMatchObject({
      errors: { "record.drop.value": { messages: ['"Q"は選択肢にありません。'] } },
    });
  });

  test("CHECK_BOX で選択肢外を送ると index 付きキーで 400", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { check: { value: ["A", "Z"] } } }),
    ).rejects.toMatchObject({
      errors: { "record.check.values[1].value": { messages: ['"Z"は選択肢にありません。'] } },
    });
  });

  test("MULTI_SELECT で複数の選択肢外を送ると複数の errors キー", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { multi: { value: ["X", "Y"] } } }),
    ).rejects.toMatchObject({
      errors: {
        "record.multi.values[0].value": { messages: ['"X"は選択肢にありません。'] },
        "record.multi.values[1].value": { messages: ['"Y"は選択肢にありません。'] },
      },
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

describeDualMode("defaultValue / defaultNowValue の自動補完", () => {
  const SESSION = "record-default-value";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
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
    }));
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
    const { id } = await client.record.addRecord({ app: appId, record: {} });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.req_with_def).toMatchObject({ value: "fallback" });
  });

  test('value:"" で送ったら defaultValue は適用されない（required なら 400）', async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { req_with_def: { value: "" } } }),
    ).rejects.toMatchObject({
      errors: { "record.req_with_def.value": { messages: ["必須です。"] } },
    });
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

  test("一括追加でも defaultValue が適用される", async () => {
    const { appId: otherAppId } = await createTestApp(SESSION, {
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

describeDualMode("SUBTABLE 対応", () => {
  const SESSION = "record-subtable";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "subtable テスト",
      properties: {
        top_title: { type: "SINGLE_LINE_TEXT", code: "top_title", label: "top" },
        items: {
          type: "SUBTABLE",
          code: "items",
          label: "テーブル",
          fields: {
            name:  { type: "SINGLE_LINE_TEXT", code: "name",  label: "name",  required: true, maxLength: "5" },
            qty:   { type: "NUMBER",           code: "qty",   label: "qty",   maxValue: "100" },
            kind:  { type: "RADIO_BUTTON",     code: "kind",  label: "kind",  defaultValue: "A",
                     options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
            note:  { type: "SINGLE_LINE_TEXT", code: "note",  label: "note",  defaultValue: "default_note" },
            cbx:   { type: "CHECK_BOX",        code: "cbx",   label: "cbx",
                     options: { P: { label: "P", index: "0" }, Q: { label: "Q", index: "1" } } },
          },
        },
      },
    }));
  });

  test("SUBTABLE に正常な行を追加できる", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: {
        items: { value: [
          { value: { name: { value: "apple" }, qty: { value: "3" }, kind: { value: "A" } } },
          { value: { name: { value: "kiwi" },  qty: { value: "5" } } },
        ] },
      },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.items!.type).toBe("SUBTABLE");
    const rows = record.items!.value as Array<{ id: string; value: Record<string, { value: unknown; type?: string }> }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBeTruthy();
    expect(rows[0]!.value.name).toMatchObject({ value: "apple", type: "SINGLE_LINE_TEXT" });
    expect(rows[0]!.value.qty).toMatchObject({ value: "3", type: "NUMBER" });
  });

  test("SUBTABLE 内の defaultValue が補完される", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { items: { value: [{ value: { name: { value: "apple" } } }] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const rows = record.items!.value as Array<{ value: Record<string, { value: unknown }> }>;
    expect(rows[0]!.value.kind).toMatchObject({ value: "A" });
    expect(rows[0]!.value.note).toMatchObject({ value: "default_note" });
  });

  test("SUBTABLE 内の required 欠落は index 付きキーで 400", async () => {
    await expect(
      client.record.addRecord({
        app: appId,
        record: { items: { value: [{ value: { qty: { value: "1" } } }] } },
      }),
    ).rejects.toMatchObject({
      code: "CB_VA01",
      errors: { "record.items.value[0].value.name.value": { messages: ["必須です。"] } },
    });
  });

  test("SUBTABLE 内の maxLength 超過", async () => {
    await expect(
      client.record.addRecord({
        app: appId,
        record: { items: { value: [
          { value: { name: { value: "ok" } } },
          { value: { name: { value: "toolong" } } },
        ] } },
      }),
    ).rejects.toMatchObject({
      errors: { "record.items.value[1].value.name.value": { messages: ["6文字より短くなければなりません。"] } },
    });
  });

  test("SUBTABLE 内の maxValue 超過", async () => {
    await expect(
      client.record.addRecord({
        app: appId,
        record: { items: { value: [{ value: { name: { value: "x" }, qty: { value: "200" } } }] } },
      }),
    ).rejects.toMatchObject({
      errors: { "record.items.value[0].value.qty.value": { messages: ["100以下である必要があります。"] } },
    });
  });

  test("SUBTABLE 内の RADIO_BUTTON options 違反", async () => {
    await expect(
      client.record.addRecord({
        app: appId,
        record: { items: { value: [{ value: { name: { value: "x" }, kind: { value: "Z" } } }] } },
      }),
    ).rejects.toMatchObject({
      errors: { "record.items.value[0].value.kind.value": { messages: ['"Z"は選択肢にありません。'] } },
    });
  });

  test("SUBTABLE 内の CHECK_BOX options 違反（values[j] 形式）", async () => {
    await expect(
      client.record.addRecord({
        app: appId,
        record: { items: { value: [{ value: { name: { value: "x" }, cbx: { value: ["P", "Z"] } } }] } },
      }),
    ).rejects.toMatchObject({
      errors: { "record.items.value[0].value.cbx.values[1].value": { messages: ['"Z"は選択肢にありません。'] } },
    });
  });

  test("SUBTABLE 空配列 / 未送信は成功", async () => {
    const r1 = await client.record.addRecord({ app: appId, record: { items: { value: [] } } });
    expect(r1.id).toBeTruthy();
    const r2 = await client.record.addRecord({ app: appId, record: { top_title: { value: "only top" } } });
    expect(r2.id).toBeTruthy();
  });

  // 実機は行 id を数値連番で自動採番するため、クライアント指定 id は保持されない → emulator のみ
  testEmulatorOnly("SUBTABLE 行に id を送ると保持される", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { items: { value: [
        { id: "my-row-id-1", value: { name: { value: "keep" } } },
      ] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const rows = record.items!.value as Array<{ id: string }>;
    expect(rows[0]!.id).toBe("my-row-id-1");
  });

  test("PUT で SUBTABLE 内 required を空にすると 400", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { items: { value: [{ value: { name: { value: "x" } } }] } },
    });
    await expect(
      client.record.updateRecord({
        app: appId, id,
        record: { items: { value: [{ value: { name: { value: "" } } }] } },
      }),
    ).rejects.toMatchObject({
      errors: { "record.items.value[0].value.name.value": { messages: ["必須です。"] } },
    });
  });

  test("getRecords でも SUBTABLE 内のフィールドに type が付く", async () => {
    await client.record.addRecord({
      app: appId,
      record: { items: { value: [{ value: { name: { value: "apple" } } }] } },
    });
    const { records } = await client.record.getRecords({ app: appId });
    const rows = records[0]!.items!.value as Array<{ value: Record<string, { type?: string }> }>;
    expect(rows[0]!.value.name!.type).toBe("SINGLE_LINE_TEXT");
    expect(rows[0]!.value.kind!.type).toBe("RADIO_BUTTON");
  });
});

describeDualMode("SUBTABLE 行の追加 / 更新 / 削除（PUT マージ）", () => {
  const SESSION = "record-subtable-put";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "subtable put テスト",
      properties: {
        top_title: { type: "SINGLE_LINE_TEXT", code: "top_title", label: "top" },
        items: {
          type: "SUBTABLE",
          code: "items",
          label: "テーブル",
          fields: {
            name: { type: "SINGLE_LINE_TEXT", code: "name", label: "name" },
            qty:  { type: "NUMBER",           code: "qty",  label: "qty" },
            kind: { type: "RADIO_BUTTON",     code: "kind", label: "kind", defaultValue: "A",
                    options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
          },
        },
      },
    }));
  });

  const seed = async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { items: { value: [
        { value: { name: { value: "r1" }, qty: { value: "10" } } },
        { value: { name: { value: "r2" }, qty: { value: "20" } } },
        { value: { name: { value: "r3" }, qty: { value: "30" } } },
      ] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const rows = record.items!.value as Array<{ id: string }>;
    return { id, rowIds: rows.map((r) => r.id) };
  };

  test("items を省略した PUT は既存テーブルを保持する", async () => {
    const { id } = await seed();
    await client.record.updateRecord({
      app: appId, id, record: { top_title: { value: "updated" } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect((record.items!.value as Array<unknown>)).toHaveLength(3);
  });

  // 実機の PUT は SUBTABLE 全体を置き換えるセマンティクス。エミュは行 id 単位でフィールドをマージする独自挙動 → emulator のみ
  testEmulatorOnly("既存行 id を指定した PUT は内部フィールドをマージ（送らないフィールドは保持）", async () => {
    const { id, rowIds } = await seed();
    // id=rowIds[0] の qty だけ更新、name は送らない → name は保持される
    await client.record.updateRecord({
      app: appId, id, record: { items: { value: [
        { id: rowIds[0]!, value: { qty: { value: "999" } } },
      ] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const rows = record.items!.value as Array<{ id: string; value: Record<string, { value: unknown }> }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(rowIds[0]);
    expect(rows[0]!.value.name).toMatchObject({ value: "r1" });
    expect(rows[0]!.value.qty).toMatchObject({ value: "999" });
    // defaultValue で補完されていた kind=A も保持される
    expect(rows[0]!.value.kind).toMatchObject({ value: "A" });
  });

  test("指定外の既存行は削除される", async () => {
    const { id, rowIds } = await seed();
    await client.record.updateRecord({
      app: appId, id, record: { items: { value: [
        { id: rowIds[0]!, value: { qty: { value: "10" } } },
      ] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const rows = record.items!.value as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(rowIds[0]);
  });

  test("id 指定行 + id 無し行の混在で、既存は更新・id 無しは新規行", async () => {
    const { id, rowIds } = await seed();
    await client.record.updateRecord({
      app: appId, id, record: { items: { value: [
        { id: rowIds[0]!, value: { qty: { value: "11" } } },
        { value: { name: { value: "new_a" } } },
        { value: { name: { value: "new_b" } } },
      ] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const rows = record.items!.value as Array<{ id: string; value: Record<string, { value: unknown }> }>;
    expect(rows).toHaveLength(3);
    expect(rows[0]!.id).toBe(rowIds[0]);
    expect(rows[0]!.value.qty).toMatchObject({ value: "11" });
    // 新規行は別の id が振られる（既存行 id とは違う）
    expect(rows[1]!.id).not.toBe(rowIds[0]);
    expect(rows[2]!.id).not.toBe(rowIds[0]);
    expect(rows[1]!.id).not.toBe(rows[2]!.id);
    expect(rows[1]!.value.name).toMatchObject({ value: "new_a" });
    expect(rows[2]!.value.name).toMatchObject({ value: "new_b" });
  });

  // 実機は存在しない行 id を 400 で拒否する。エミュは新規行として扱う独自挙動 → emulator のみ
  testEmulatorOnly("存在しない行 id を指定すると新規行として新しい id が振られる", async () => {
    const { id, rowIds } = await seed();
    await client.record.updateRecord({
      app: appId, id, record: { items: { value: [
        { id: "9999999", value: { name: { value: "phantom" } } },
      ] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const rows = record.items!.value as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe("9999999");
    expect(rowIds).not.toContain(rows[0]!.id);
  });

  test("items.value = [] は全行削除", async () => {
    const { id } = await seed();
    await client.record.updateRecord({
      app: appId, id, record: { items: { value: [] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.items!.value).toEqual([]);
  });

  test("id 無し行のみ送ると全行が新しい id に置き換わる", async () => {
    const { id, rowIds } = await seed();
    await client.record.updateRecord({
      app: appId, id, record: { items: { value: [
        { value: { name: { value: "x" } } },
        { value: { name: { value: "y" } } },
      ] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const rows = record.items!.value as Array<{ id: string }>;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(rowIds).not.toContain(r.id);
    }
  });
});

describeDualMode("SUBTABLE 内 NUMBER の正規化 / 非数値の扱い", () => {
  const SESSION = "record-subtable-num";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "subtable number normalize",
      properties: {
        items: {
          type: "SUBTABLE", code: "items", label: "items",
          fields: {
            qty: { type: "NUMBER", code: "qty", label: "qty" },
          },
        },
      },
    }));
  });

  const addRow = async (qtyValue: unknown) => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: { items: { value: [{ value: { qty: { value: qtyValue as string } } }] } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    const row = (record.items!.value as unknown as Array<{ value: { qty: { value: unknown } } }>)[0]!;
    return row.value.qty.value;
  };

  test("数値として解釈可能な文字列は正規化して保存（指数表記）", async () => {
    expect(await addRow("1.5e1")).toBe("15");
  });

  test("前後空白は無視されて保存", async () => {
    expect(await addRow(" 42 ")).toBe("42");
  });

  test("非数値 'abc' は空文字列として保存", async () => {
    expect(await addRow("abc")).toBe("");
  });

  test("カンマ区切り '1,000' は空文字列として保存", async () => {
    expect(await addRow("1,000")).toBe("");
  });

  test("先頭数値混在 '12abc' は空文字列として保存", async () => {
    expect(await addRow("12abc")).toBe("");
  });

  test("空文字列はそのまま空文字列", async () => {
    expect(await addRow("")).toBe("");
  });
});

describeDualMode("top-level NUMBER の正規化", () => {
  const SESSION = "record-top-num";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "top number normalize",
      properties: {
        n: { type: "NUMBER", code: "n", label: "n" },
      },
    }));
  });

  const addAndGet = async (input: unknown) => {
    const { id } = await client.record.addRecord({
      app: appId, record: { n: { value: input as string } },
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    return record.n!.value;
  };

  test("指数表記は整数文字列に正規化される（\"1.5e1\" → \"15\"）", async () => {
    expect(await addAndGet("1.5e1")).toBe("15");
  });

  test("前後空白は取り除かれる（\" 42 \" → \"42\"）", async () => {
    expect(await addAndGet(" 42 ")).toBe("42");
  });

  test("整数はそのまま保存（\"100\" → \"100\"）", async () => {
    expect(await addAndGet("100")).toBe("100");
  });

  test("非数値は 400 エラー（SUBTABLE 内と違い top-level は拒否）", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { n: { value: "abc" } } }),
    ).rejects.toMatchObject({
      errors: { "record[n].value": { messages: ["数字でなければなりません。"] } },
    });
  });
});

describeDualMode("ルックアップ（LOOKUP）", () => {
  const SESSION = "record-lookup";
  let client: KintoneRestAPIClient;
  let masterAppId: number;
  let lookupAppId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);

    // 参照元（マスター）アプリ: code (unique) / name / price
    ({ appId: masterAppId } = await createTestApp(SESSION, {
      name: "商品マスター",
      properties: {
        code:  { type: "SINGLE_LINE_TEXT", code: "code",  label: "コード", unique: true },
        name:  { type: "SINGLE_LINE_TEXT", code: "name",  label: "名前" },
        price: { type: "NUMBER",           code: "price", label: "価格" },
      },
      records: [
        { code: { value: "P001" }, name: { value: "りんご" }, price: { value: "100" } },
        { code: { value: "P002" }, name: { value: "みかん" }, price: { value: "80" } },
        { code: { value: "P003" }, name: { value: "ぶどう" }, price: { value: "300" } },
      ],
    }));

    // ルックアップ保持アプリ
    ({ appId: lookupAppId } = await createTestApp(SESSION, {
      name: "注文",
      properties: {
        prod_code: {
          type: "SINGLE_LINE_TEXT", code: "prod_code", label: "商品コード",
          lookup: {
            relatedApp: { app: String(masterAppId) },
            relatedKeyField: "code",
            fieldMappings: [
              { field: "prod_name",  relatedField: "name" },
              { field: "prod_price", relatedField: "price" },
            ],
            lookupPickerFields: ["code", "name"],
            filterCond: "",
            sort: "",
          },
        },
        prod_name:  { type: "SINGLE_LINE_TEXT", code: "prod_name",  label: "商品名" },
        prod_price: { type: "NUMBER",           code: "prod_price", label: "価格" },
        qty:        { type: "NUMBER",           code: "qty",        label: "数量" },
      },
    }));
  });

  test("キー一致でコピー先が自動的に埋まる", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: { prod_code: { value: "P001" }, qty: { value: "5" } },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    expect(record.prod_code).toMatchObject({ value: "P001" });
    expect(record.prod_name).toMatchObject({ value: "りんご" });
    expect(record.prod_price).toMatchObject({ value: "100" });
    expect(record.qty).toMatchObject({ value: "5" });
  });

  test("キー不一致で 400 GAIA_LO04", async () => {
    await expect(
      client.record.addRecord({ app: lookupAppId, record: { prod_code: { value: "P999" } } }),
    ).rejects.toMatchObject({ code: "GAIA_LO04" });
  });

  test("コピー先フィールドへの直接送信は無視される（ルックアップ結果で上書き）", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId,
      record: {
        prod_code: { value: "P001" },
        prod_name: { value: "直接指定" },
        prod_price: { value: "9999" },
      },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    expect(record.prod_name).toMatchObject({ value: "りんご" });
    expect(record.prod_price).toMatchObject({ value: "100" });
  });

  test("キー空文字 / 未送信でコピー先も空", async () => {
    const r1 = await client.record.addRecord({
      app: lookupAppId, record: { prod_code: { value: "" }, qty: { value: "1" } },
    });
    const rec1 = await client.record.getRecord({ app: lookupAppId, id: r1.id });
    expect(rec1.record.prod_code).toMatchObject({ value: "" });
    expect(rec1.record.prod_name).toMatchObject({ value: "" });
    expect(rec1.record.prod_price).toMatchObject({ value: "" });

    const r2 = await client.record.addRecord({
      app: lookupAppId, record: { qty: { value: "2" } },
    });
    const rec2 = await client.record.getRecord({ app: lookupAppId, id: r2.id });
    expect(rec2.record.prod_name?.value ?? "").toBe("");
    expect(rec2.record.prod_price?.value ?? "").toBe("");
  });

  test("PUT でキー変更すると再コピーされる", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: { prod_code: { value: "P001" } },
    });
    await client.record.updateRecord({
      app: lookupAppId, id, record: { prod_code: { value: "P002" } },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    expect(record.prod_name).toMatchObject({ value: "みかん" });
    expect(record.prod_price).toMatchObject({ value: "80" });
  });

  test("PUT でキーを空文字に更新するとコピー先もクリア", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: { prod_code: { value: "P001" } },
    });
    await client.record.updateRecord({
      app: lookupAppId, id, record: { prod_code: { value: "" } },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    expect(record.prod_name).toMatchObject({ value: "" });
    expect(record.prod_price).toMatchObject({ value: "" });
  });

  test("PUT でキー未送信なら既存コピー先は保持", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: { prod_code: { value: "P001" } },
    });
    await client.record.updateRecord({
      app: lookupAppId, id, record: { qty: { value: "10" } },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    expect(record.prod_code).toMatchObject({ value: "P001" });
    expect(record.prod_name).toMatchObject({ value: "りんご" });
    expect(record.prod_price).toMatchObject({ value: "100" });
    expect(record.qty).toMatchObject({ value: "10" });
  });

  test("PUT でキー不一致に変更すると 400 GAIA_LO04", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: { prod_code: { value: "P001" } },
    });
    await expect(
      client.record.updateRecord({ app: lookupAppId, id, record: { prod_code: { value: "P999" } } }),
    ).rejects.toMatchObject({ code: "GAIA_LO04" });
  });

  test("一括 addRecords で各行にルックアップが効く", async () => {
    const { ids } = await client.record.addRecords({
      app: lookupAppId, records: [
        { prod_code: { value: "P001" } },
        { prod_code: { value: "P003" } },
      ],
    });
    const r1 = await client.record.getRecord({ app: lookupAppId, id: ids[0]! });
    const r2 = await client.record.getRecord({ app: lookupAppId, id: ids[1]! });
    expect(r1.record.prod_name).toMatchObject({ value: "りんご" });
    expect(r2.record.prod_name).toMatchObject({ value: "ぶどう" });
  });

  test("一括 addRecords で 1 件でもキー不一致なら全件失敗（GAIA_LO04）", async () => {
    await expect(
      client.record.addRecords({
        app: lookupAppId, records: [
          { prod_code: { value: "P001" } },
          { prod_code: { value: "P999" } },
        ],
      }),
    ).rejects.toMatchObject({ code: "GAIA_LO04" });

    // ロールバック確認: P001 のレコードも保存されていない
    const all = await client.record.getRecords({ app: lookupAppId });
    expect(all.records).toHaveLength(0);
  });

  test("ルックアップ元マスターの値変更はルックアップ側に伝播しない（スナップショット）", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: { prod_code: { value: "P001" } },
    });
    // マスターの P001 の name を書き換え
    const { records: masters } = await client.record.getRecords({
      app: masterAppId, query: 'code = "P001"',
    });
    await client.record.updateRecord({
      app: masterAppId, id: masters[0]!.$id!.value as string,
      record: { name: { value: "ピンクりんご" } },
    });
    // ルックアップ側は変わらない
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    expect(record.prod_name).toMatchObject({ value: "りんご" });
  });
});

// エミュレーター固有: エラーメッセージ文字列 / Accept-Language 挙動
describeEmulatorOnly("ルックアップ（emulator 固有の応答形）", () => {
  const SESSION = "record-lookup-emu";
  let BASE_URL: string;
  let client: KintoneRestAPIClient;
  let lookupAppId: number;

  beforeAll(() => { BASE_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(BASE_URL);
    client = new KintoneRestAPIClient({ baseUrl: BASE_URL, auth: { apiToken: "test" } });
    const masterAppId = await createApp(BASE_URL, {
      name: "商品マスター",
      properties: {
        code:  { type: "SINGLE_LINE_TEXT", code: "code",  label: "コード", unique: true },
        name:  { type: "SINGLE_LINE_TEXT", code: "name",  label: "名前" },
      },
      records: [{ code: { value: "P001" }, name: { value: "りんご" } }],
    });
    lookupAppId = await createApp(BASE_URL, {
      name: "注文",
      properties: {
        prod_code: {
          type: "SINGLE_LINE_TEXT", code: "prod_code", label: "商品コード",
          lookup: {
            relatedApp: { app: String(masterAppId) },
            relatedKeyField: "code",
            fieldMappings: [{ field: "prod_name", relatedField: "name" }],
            lookupPickerFields: ["code", "name"],
            filterCond: "", sort: "",
          },
        },
        prod_name: { type: "SINGLE_LINE_TEXT", code: "prod_name", label: "商品名" },
      },
    });
    // client 初期化で使用するために lookupAppId を閉じ込めた parameter 名で touch
    void client;
  });
  afterEach(async () => { await finalizeSession(BASE_URL); });

  test("キー不一致の ja エラーメッセージと errors undefined", async () => {
    const r = await fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: lookupAppId, record: { prod_code: { value: "P999" } } }),
    });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("GAIA_LO04");
    expect(json.message).toBe(
      "フィールド「prod_code」の値「P999」が、ルックアップの参照先のフィールドにないか、またはアプリやフィールドの閲覧権限がありません。"
    );
    expect(json.errors).toBeUndefined();
  });

  test("Accept-Language: en で英語メッセージ", async () => {
    const r = await fetch(`${BASE_URL}/k/v1/record.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": "en" },
      body: JSON.stringify({ app: lookupAppId, record: { prod_code: { value: "P999" } } }),
    });
    const json = await r.json();
    expect(json.message).toBe(
      "A value P999 in the field prod_code does not exist in the datasource app for lookup, or you do not have permission to view the app or the field."
    );
  });
});

describeDualMode("ルックアップ: relatedKeyField が RECORD_NUMBER", () => {
  const SESSION = "record-lookup-recno";
  let client: KintoneRestAPIClient;
  let masterAppId: number;
  let lookupAppId: number;
  let masterRecordIds: number[];

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);

    const master = await createTestApp(SESSION, {
      name: "商品マスター",
      properties: {
        name: { type: "SINGLE_LINE_TEXT", code: "name", label: "名前" },
      },
      records: [
        { name: { value: "一番目" } },
        { name: { value: "二番目" } },
        { name: { value: "三番目" } },
      ],
    });
    masterAppId = master.appId;
    masterRecordIds = master.recordIds;
    // emulator は createTestApp が recordIds を返さないので getRecords で取り直す
    if (masterRecordIds.length === 0) {
      const all = await client.record.getRecords({
        app: masterAppId, query: "order by $id asc",
      });
      masterRecordIds = all.records.map((r) => Number(r.$id!.value));
    }

    ({ appId: lookupAppId } = await createTestApp(SESSION, {
      name: "参照",
      properties: {
        by_no: {
          type: "NUMBER", code: "by_no", label: "by_no",
          lookup: {
            relatedApp: { app: String(masterAppId) },
            relatedKeyField: "レコード番号",
            fieldMappings: [
              { field: "copied_no", relatedField: "レコード番号" },
              { field: "copied_name", relatedField: "name" },
            ],
            lookupPickerFields: ["レコード番号"],
            filterCond: "",
            sort: "",
          },
        },
        copied_no:   { type: "NUMBER", code: "copied_no", label: "copied_no" },
        copied_name: { type: "SINGLE_LINE_TEXT", code: "copied_name", label: "copied_name" },
      },
    }));
  });

  test("レコード番号で参照先レコードを特定しコピーする", async () => {
    // 2 番目のマスターレコード（name=二番目）をレコード番号で参照
    const secondRecNo = String(masterRecordIds[1]);
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: { by_no: { value: secondRecNo } },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    expect(record.copied_no).toMatchObject({ value: secondRecNo });
    expect(record.copied_name).toMatchObject({ value: "二番目" });
  });

  test("存在しないレコード番号で GAIA_LO04", async () => {
    await expect(
      client.record.addRecord({ app: lookupAppId, record: { by_no: { value: "9999999" } } }),
    ).rejects.toMatchObject({ code: "GAIA_LO04" });
  });

  test("レコード番号キーを空で送るとコピー先もクリア", async () => {
    const firstRecNo = String(masterRecordIds[0]);
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: { by_no: { value: firstRecNo } },
    });
    await client.record.updateRecord({
      app: lookupAppId, id, record: { by_no: { value: "" } },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    expect(record.copied_no).toMatchObject({ value: "" });
    expect(record.copied_name).toMatchObject({ value: "" });
  });
});
