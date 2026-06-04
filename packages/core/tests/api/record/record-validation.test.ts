import { KintoneRestAPIClient, KintoneRestAPIError } from "@kintone/rest-api-client";
import { beforeEach, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

describeDualMode("required フィールドのバリデーション", () => {
  const SESSION = "record-required-validation";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "必須テストアプリ",
      properties: {
        req_text:  { type: "SINGLE_LINE_TEXT", code: "req_text",  label: "必須テキスト", required: true },
        opt_text:  { type: "SINGLE_LINE_TEXT", code: "opt_text",  label: "任意テキスト", required: false },
        req_check: { type: "CHECK_BOX",        code: "req_check", label: "必須チェック", required: true,
                     options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } } },
      },
    }));
  });

  test("required フィールドを省略して POST すると 400 が返る", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: {} }),
    ).rejects.toMatchObject({
      code: "CB_VA01",
      errors: {
        "record.req_text.value":   { messages: ["必須です。"] },
        "record.req_check.values": { messages: ["必須です。"] },
      },
    });
  });

  test("required の SINGLE_LINE_TEXT に空文字を渡すと 400", async () => {
    await expect(
      client.record.addRecord({
        app: appId,
        record: {
          req_text:  { value: "" },
          req_check: { value: ["A"] },
        },
      }),
    ).rejects.toMatchObject({
      errors: { "record.req_text.value": { messages: ["必須です。"] } },
    });
  });

  test("required の CHECK_BOX に空配列を渡すと 400", async () => {
    await expect(
      client.record.addRecord({
        app: appId,
        record: {
          req_text:  { value: "x" },
          req_check: { value: [] },
        },
      }),
    ).rejects.toMatchObject({
      errors: { "record.req_check.values": { messages: ["必須です。"] } },
    });
  });

  test("required をすべて埋めれば成功し、required でない opt_text は省略可", async () => {
    const result = await client.record.addRecord({
      app: appId,
      record: {
        req_text:  { value: "x" },
        req_check: { value: ["A"] },
      },
    });
    expect(result).toMatchObject({ id: expect.any(String), revision: "1" });
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
      },
    });
    const result = await client.record.updateRecord({
      app: appId, id, record: { opt_text: { value: "hello" } },
    });
    expect(result.revision).toBe("2");
  });

  test("PUT で required フィールドを空文字に更新すると 400", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: {
        req_text:  { value: "x" },
        req_check: { value: ["A"] },
      },
    });
    await expect(
      client.record.updateRecord({ app: appId, id, record: { req_text: { value: "" } } }),
    ).rejects.toMatchObject({
      errors: { "record.req_text.value": { messages: ["必須です。"] } },
    });
  });
});

// required がスカラー (.value) / 配列 (.values) として扱われる型を網羅的に検証
// 注: RADIO_BUTTON は実機で required が発動しない（未送信でも null 保存される）ため対象外
describeDualMode("required フィールドのバリデーション（各フィールドタイプ）", () => {
  const SESSION = "record-required-types";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "required types",
      properties: {
        req_multi_text: { type: "MULTI_LINE_TEXT", code: "req_multi_text", label: "mt", required: true },
        req_rich:       { type: "RICH_TEXT",       code: "req_rich",       label: "rt", required: true },
        req_num:        { type: "NUMBER",          code: "req_num",        label: "n",  required: true },
        req_date:       { type: "DATE",            code: "req_date",       label: "d",  required: true },
        req_time:       { type: "TIME",            code: "req_time",       label: "t",  required: true },
        req_datetime:   { type: "DATETIME",        code: "req_datetime",   label: "dt", required: true },
        req_drop:       { type: "DROP_DOWN",       code: "req_drop",       label: "dd", required: true,
                          options: { A: { label: "A", index: "0" } } },
        req_multi_sel:  { type: "MULTI_SELECT",    code: "req_multi_sel",  label: "ms", required: true,
                          options: { A: { label: "A", index: "0" } } },
      },
    }));
  });

  test("POST {} で各フィールドに必須エラーが返る（スカラーは .value / 配列は .values 接尾辞）", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: {} }),
    ).rejects.toMatchObject({
      code: "CB_VA01",
      errors: {
        "record.req_multi_text.value": { messages: ["必須です。"] },
        "record.req_rich.value":       { messages: ["必須です。"] },
        "record.req_num.value":        { messages: ["必須です。"] },
        "record.req_date.value":       { messages: ["必須です。"] },
        "record.req_time.value":       { messages: ["必須です。"] },
        "record.req_datetime.value":   { messages: ["必須です。"] },
        "record.req_drop.value":       { messages: ["必須です。"] },
        "record.req_multi_sel.values": { messages: ["必須です。"] },
      },
    });
  });

  test("全 required を埋めれば成功", async () => {
    const result = await client.record.addRecord({
      app: appId,
      record: {
        req_multi_text: { value: "x" },
        req_rich:       { value: "x" },
        req_num:        { value: "1" },
        req_date:       { value: "2026-01-01" },
        req_time:       { value: "12:00" },
        req_datetime:   { value: "2026-01-01T12:00:00Z" },
        req_drop:       { value: "A" },
        req_multi_sel:  { value: ["A"] },
      },
    });
    expect(result.id).toBeTruthy();
  });

  test("MULTI_SELECT に空配列を渡すと 400（errors キーは .values 接尾辞）", async () => {
    await expect(
      client.record.addRecord({
        app: appId,
        record: {
          req_multi_text: { value: "x" },
          req_rich:       { value: "x" },
          req_num:        { value: "1" },
          req_date:       { value: "2026-01-01" },
          req_time:       { value: "12:00" },
          req_datetime:   { value: "2026-01-01T12:00:00Z" },
          req_drop:       { value: "A" },
          req_multi_sel:  { value: [] },
        },
      }),
    ).rejects.toMatchObject({
      errors: { "record.req_multi_sel.values": { messages: ["必須です。"] } },
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

// 実機で unique: true を保持するタイプは SINGLE_LINE_TEXT / NUMBER / LINK / DATE / DATETIME のみ。
// 他タイプ (MULTI_LINE_TEXT / RICH_TEXT / TIME / RADIO_BUTTON / DROP_DOWN / CALC など) に
// unique: true を送っても API は 200 だが silently drop される → 重複しても検証されない
describeDualMode("unique 検証対象のフィールドタイプ", () => {
  const SESSION = "record-unique-types";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "unique types",
      properties: {
        u_text:      { type: "SINGLE_LINE_TEXT", code: "u_text",     label: "t",  unique: true },
        u_num:       { type: "NUMBER",           code: "u_num",      label: "n",  unique: true },
        u_link:      { type: "LINK",             code: "u_link",     label: "l",  unique: true, protocol: "WEB" },
        u_date:      { type: "DATE",             code: "u_date",     label: "d",  unique: true },
        u_datetime:  { type: "DATETIME",         code: "u_datetime", label: "dt", unique: true },
        // 実機では unique が silently drop されるため、重複してもエラーにならないことを検証
        nu_time:     { type: "TIME",             code: "nu_time",    label: "t",  unique: true },
        nu_multi:    { type: "MULTI_LINE_TEXT",  code: "nu_multi",   label: "m",  unique: true },
      },
    }));
  });

  test("SINGLE_LINE_TEXT / NUMBER / LINK / DATE / DATETIME は重複で 400", async () => {
    const firstRecord = {
      u_text:     { value: "a" },
      u_num:      { value: "1" },
      u_link:     { value: "https://example.com/a" },
      u_date:     { value: "2026-01-01" },
      u_datetime: { value: "2026-01-01T00:00:00Z" },
    };
    await client.record.addRecord({ app: appId, record: firstRecord });

    // 各フィールドを 1 つずつ重複させてエラーが返ることを確認
    const cases: Array<[keyof typeof firstRecord, Record<string, { value: unknown }>]> = [
      ["u_text",     { u_text: { value: "a" },                   u_num: { value: "2" }, u_link: { value: "https://example.com/b" }, u_date: { value: "2026-01-02" }, u_datetime: { value: "2026-01-02T00:00:00Z" } }],
      ["u_num",      { u_text: { value: "b" },                   u_num: { value: "1" }, u_link: { value: "https://example.com/b" }, u_date: { value: "2026-01-02" }, u_datetime: { value: "2026-01-02T00:00:00Z" } }],
      ["u_link",     { u_text: { value: "c" },                   u_num: { value: "3" }, u_link: { value: "https://example.com/a" }, u_date: { value: "2026-01-03" }, u_datetime: { value: "2026-01-03T00:00:00Z" } }],
      ["u_date",     { u_text: { value: "d" },                   u_num: { value: "4" }, u_link: { value: "https://example.com/c" }, u_date: { value: "2026-01-01" }, u_datetime: { value: "2026-01-04T00:00:00Z" } }],
      ["u_datetime", { u_text: { value: "e" },                   u_num: { value: "5" }, u_link: { value: "https://example.com/d" }, u_date: { value: "2026-01-05" }, u_datetime: { value: "2026-01-01T00:00:00Z" } }],
    ];
    for (const [dupField, record] of cases) {
      await expect(
        client.record.addRecord({ app: appId, record }),
      ).rejects.toMatchObject({
        errors: { [`record.${dupField}.value`]: { messages: ["値がほかのレコードと重複しています。"] } },
      });
    }
  });

  test("TIME / MULTI_LINE_TEXT は unique: true を送っても実機では検証されない（silently drop）", async () => {
    const base = {
      u_text:     { value: "x1" },
      u_num:      { value: "10" },
      u_link:     { value: "https://example.com/x1" },
      u_date:     { value: "2026-02-01" },
      u_datetime: { value: "2026-02-01T00:00:00Z" },
      nu_time:    { value: "12:00" },
      nu_multi:   { value: "same text" },
    };
    await client.record.addRecord({ app: appId, record: base });
    // TIME / MULTI_LINE_TEXT を同じ値で 2 件目作成 → 成功するはず
    const second = await client.record.addRecord({
      app: appId,
      record: {
        u_text:     { value: "x2" },
        u_num:      { value: "20" },
        u_link:     { value: "https://example.com/x2" },
        u_date:     { value: "2026-02-02" },
        u_datetime: { value: "2026-02-02T00:00:00Z" },
        nu_time:    { value: "12:00" },     // 同じ値
        nu_multi:   { value: "same text" },  // 同じ値
      },
    });
    expect(second.id).toBeTruthy();
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

  test("空文字は minLength 検証に引っかかる（実機準拠）", async () => {
    await expect(
      client.record.addRecord({ app: appId, record: { text: { value: "" } } }),
    ).rejects.toMatchObject({
      errors: { "record.text.value": { messages: ["1文字より長くなければなりません。"] } },
    });
  });

  test("範囲内なら成功", async () => {
    const ok = await client.record.addRecord({ app: appId, record: { text: { value: "abc" } } });
    expect(ok.id).toBeTruthy();
  });
});

describeDualMode("LINK の minLength", () => {
  const SESSION = "record-link-length";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "link length",
      properties: {
        link: { type: "LINK", code: "link", label: "link", minLength: "3", protocol: "WEB" },
      },
    }));
  });

  test("短い値で minLength エラー（実機は URL 形式エラーも同時に返す）", async () => {
    // 実機: `"2文字より..."` + `"URLの形式が正しくありません..."` の 2 つが messages に入る。
    // emulator: minLength エラーのみ。どちらでも minLength エラーが含まれることを確認
    await expect(
      client.record.addRecord({ app: appId, record: { link: { value: "ab" } } }),
    ).rejects.toMatchObject({
      errors: {
        "record.link.value": {
          messages: expect.arrayContaining(["2文字より長くなければなりません。"]),
        },
      },
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

