import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { createTestApp, describeDualMode, describeEmulatorOnly, getTestClient, resetTestEnvironment } from "../../real-kintone";

describeDualMode("アプリのレコード一覧のAPI", () => {
  const SESSION = "records-list";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "records list",
      properties: {
        test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" },
        test2: { type: "SINGLE_LINE_TEXT", code: "test2", label: "Test2" },
        postedAt: { type: "DATETIME", code: "postedAt", label: "Posted At" },
        テスト: { type: "SINGLE_LINE_TEXT", code: "テスト", label: "テスト" },
        理由: { type: "SINGLE_LINE_TEXT", code: "理由", label: "理由" },
        理由_new: { type: "SINGLE_LINE_TEXT", code: "理由_new", label: "理由_new" },
        日時: { type: "DATETIME", code: "日時", label: "日時" },
        // NOTE: 実機のシステムフィールド `ステータス` (type: STATUS) と衝突するため、`st_dd` にリネーム
        st_dd: {
          type: "DROP_DOWN",
          code: "st_dd",
          label: "ドロップダウン",
          options: {
            あ: { label: "あ", index: "0" },
            い: { label: "い", index: "1" },
            う: { label: "う", index: "2" },
          },
        },
      },
    }));
  });

  test("アプリのレコードを検索するとデータが返ってくる", async () => {
    const result1 = await client.record.addRecord({ app: appId, record: { test: { value: "test" } } });
    const result2 = await client.record.addRecord({ app: appId, record: { test: { value: "test2" } } });
    expect(result1).toMatchObject({ id: expect.any(String), revision: "1" });
    const records = await client.record.getRecords({ app: appId });
    expect(records.records).toHaveLength(2);
    // 実 kintone / emulator ともデフォルトで $id desc なので 2 件目が先頭
    expect(records.records[0]!["$id"]!.value).toEqual(result2.id);
    expect(records.records[0]!.test!.value).toEqual("test2");
    expect(records.records[0]!.test!.type).toEqual("SINGLE_LINE_TEXT");
  });

  test("fieldsを指定するとそこのデータだけ出力される", async () => {
    await client.record.addRecord({
      app: appId,
      record: {
        test: { value: "test" },
        test2: { value: "test" },
        postedAt: { value: "2022-01-01T00:00:00Z" },
      },
    });
    const records = await client.record.getRecords({ app: appId, fields: ["test"] });
    expect(records.records[0]!).not.toHaveProperty("test2");
  });

  describe("queryが存在する時、", () => {
    let firstId: string;
    beforeEach(async () => {
      const r1 = await client.record.addRecord({
        app: appId,
        record: {
          test: { value: "test" },
          test2: { value: "test" },
          postedAt: { value: "2022-01-01T00:00:00Z" },
          テスト: { value: "テスト" },
        },
      });
      firstId = r1.id;
      await client.record.addRecord({
        app: appId,
        record: {
          test: { value: "test2" },
          test2: { value: "test2" },
          postedAt: { value: "2100-01-01T00:00:00Z" },
          テスト: { value: "テスト2" },
        },
      });
    });

    test("1つの=の式", async () => {
      // 実機は文字列リテラルを double-quote でしか受け付けない
      const records = await client.record.getRecords({ app: appId, query: 'test = "test"' });
      expect(records.records).toHaveLength(1);
    });
    test("2つの=の式", async () => {
      const records = await client.record.getRecords({ app: appId, query: 'test = "test" or test2 = "test2"' });
      expect(records.records).toHaveLength(2);
    });
    test("!=の式", async () => {
      const records = await client.record.getRecords({ app: appId, query: 'test != "test"' });
      expect(records.records).toHaveLength(1);
    });
    test("NOW()を使った場合", async () => {
      const records = await client.record.getRecords({ app: appId, query: "postedAt < NOW()" });
      expect(records.records).toHaveLength(1);
    });
    test("order byを指定する", async () => {
      const records = await client.record.getRecords({ app: appId, query: "order by test desc" });
      expect(records.records).toHaveLength(2);
      expect(records.records[0]!.test!.value).toEqual("test2");
    });
    test("idを指定する", async () => {
      const records = await client.record.getRecords({ app: appId, query: `$id = ${firstId}` });
      expect(records.records).toHaveLength(1);
    });
    test("日本語のフィールドで検索する", async () => {
      const records = await client.record.getRecords({ app: appId, query: 'テスト = "テスト"' });
      expect(records.records).toHaveLength(1);
    });
    test("日本語フィールドが複数ある場合で検索する", async () => {
      const records = await client.record.getRecords({ app: appId, query: 'テスト = "テスト" or テスト = "テスト2"' });
      expect(records.records).toHaveLength(2);
    });
    test('"で囲った値で検索する', async () => {
      const records = await client.record.getRecords({ app: appId, query: 'test = "test"' });
      expect(records.records).toHaveLength(1);
    });
    test("複雑なクエリで検索する", async () => {
      const records = await client.record.getRecords({
        app: appId,
        query: '((理由 in ("") and 理由_new in ("")) or 日時 != "" ) and 日時 = "" and 理由 in ("") and st_dd in ("あ","い","う")',
      });
      expect(records.records).toHaveLength(0);
    });
  });

  describe("レコード削除", () => {
    test("レコードを削除できる", async () => {
      const { id: id1 } = await client.record.addRecord({ app: appId, record: { test: { value: "test1" } } });
      const { id: id2 } = await client.record.addRecord({ app: appId, record: { test: { value: "test2" } } });
      await client.record.deleteRecords({ app: appId, ids: [Number(id1), Number(id2)] });
      const records = await client.record.getRecords({ app: appId });
      expect(records.records).toHaveLength(0);
    });

    test("一部のレコードだけ削除できる", async () => {
      const { id: id1 } = await client.record.addRecord({ app: appId, record: { test: { value: "test1" } } });
      await client.record.addRecord({ app: appId, record: { test: { value: "test2" } } });
      await client.record.deleteRecords({ app: appId, ids: [Number(id1)] });
      const records = await client.record.getRecords({ app: appId });
      expect(records.records).toHaveLength(1);
      expect(records.records[0]!.test!.value).toEqual("test2");
    });

    test("存在しないレコードIDを指定すると GAIA_RE01（実機準拠・削除は行われない）", async () => {
      await client.record.addRecord({ app: appId, record: { test: { value: "test1" } } });
      await expect(
        client.record.deleteRecords({ app: appId, ids: [99999999] }),
      ).rejects.toMatchObject({ code: "GAIA_RE01" });
      const records = await client.record.getRecords({ app: appId });
      expect(records.records).toHaveLength(1);
    });
  });
});

describeDualMode("一括 addRecords / updateRecords", () => {
  const SESSION = "records-bulk";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "records bulk",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "title", required: true, maxLength: "20" },
        num:   { type: "NUMBER",           code: "num",   label: "num",   maxValue: "1000" },
        uniq:  { type: "SINGLE_LINE_TEXT", code: "uniq",  label: "uniq",  unique: true },
        def:   { type: "SINGLE_LINE_TEXT", code: "def",   label: "def",   defaultValue: "d" },
      },
    }));
  });

  test("addRecords 正常: ids / revisions が返る", async () => {
    const result = await client.record.addRecords({
      app: appId,
      records: [
        { title: { value: "a" }, uniq: { value: "u1" } },
        { title: { value: "b" }, uniq: { value: "u2" } },
        { title: { value: "c" }, uniq: { value: "u3" } },
      ],
    });
    expect(result.ids).toHaveLength(3);
    expect(result.ids.every((id) => /^\d+$/.test(id))).toBe(true);
    expect(result.revisions).toEqual(["1", "1", "1"]);
  });

  test("addRecords で defaultValue が補完される", async () => {
    const { ids } = await client.record.addRecords({
      app: appId,
      records: [{ title: { value: "a" } }, { title: { value: "b" }, def: { value: "override" } }],
    });
    const r1 = await client.record.getRecord({ app: appId, id: ids[0]! });
    const r2 = await client.record.getRecord({ app: appId, id: ids[1]! });
    expect(r1.record.def).toMatchObject({ value: "d" });
    expect(r2.record.def).toMatchObject({ value: "override" });
  });

  test("addRecords 空配列は空のままで成功", async () => {
    const result = await client.record.addRecords({ app: appId, records: [] });
    expect(result.ids).toEqual([]);
    expect(result.revisions).toEqual([]);
  });

  test("addRecords 101件で CB_VA01 が返る", async () => {
    const records = Array.from({ length: 101 }, (_, i) => ({ title: { value: `x${i}` } }));
    await expect(
      client.record.addRecords({ app: appId, records }),
    ).rejects.toMatchObject({
      code: "CB_VA01",
      errors: { records: { messages: ["一度に100件までのレコードを追加できます。"] } },
    });
  });

  test("addRecords validation 失敗時は index 付きキーで errors", async () => {
    await expect(
      client.record.addRecords({
        app: appId,
        records: [
          { title: { value: "ok1" } },
          { num: { value: "5" } },          // title 欠落
          { title: { value: "ok3" } },
        ],
      }),
    ).rejects.toMatchObject({
      code: "CB_VA01",
      errors: { "records[1].title.value": { messages: ["必須です。"] } },
    });
  });

  test("addRecords トランザクション: 1件でも失敗すれば全件ロールバック", async () => {
    await client.record.addRecord({ app: appId, record: { title: { value: "pre" }, uniq: { value: "u1" } } });

    await expect(
      client.record.addRecords({
        app: appId,
        records: [
          { title: { value: "a" }, uniq: { value: "u2" } },
          { title: { value: "b" }, uniq: { value: "u1" } },  // 重複
        ],
      }),
    ).rejects.toThrow();

    // ロールバック確認: uniq=u2 のレコードは保存されていない
    const all = await client.record.getRecords({ app: appId, query: "order by $id asc" });
    expect(all.records).toHaveLength(1);
    expect(all.records[0]!.uniq).toMatchObject({ value: "u1" });
  });

  test("updateRecords 正常: records[] に {id, revision}", async () => {
    const { ids } = await client.record.addRecords({
      app: appId,
      records: [
        { title: { value: "a" }, uniq: { value: "u1" } },
        { title: { value: "b" }, uniq: { value: "u2" } },
      ],
    });
    const result = await client.record.updateRecords({
      app: appId,
      records: [
        { id: ids[0]!, record: { title: { value: "a2" } } },
        { id: ids[1]!, record: { title: { value: "b2" } } },
      ],
    });
    expect(result.records).toEqual([
      { id: ids[0], revision: "2" },
      { id: ids[1], revision: "2" },
    ]);
  });

  test("updateRecords 存在しない id は GAIA_RE01", async () => {
    await expect(
      client.record.updateRecords({
        app: appId,
        records: [{ id: 99999, record: { title: { value: "x" } } }],
      }),
    ).rejects.toMatchObject({ code: "GAIA_RE01" });
  });

  test("updateRecords validation 失敗は index 付きキー", async () => {
    const { ids } = await client.record.addRecords({
      app: appId,
      records: [
        { title: { value: "a" }, uniq: { value: "u1" } },
        { title: { value: "b" }, uniq: { value: "u2" } },
      ],
    });
    await expect(
      client.record.updateRecords({
        app: appId,
        records: [
          { id: ids[0]!, record: { title: { value: "ok" } } },
          { id: ids[1]!, record: { title: { value: "too_long_value_exceeds_maxlength_20_chars" } } },
        ],
      }),
    ).rejects.toMatchObject({
      errors: { "records[1].title.value": { messages: ["21文字より短くなければなりません。"] } },
    });
  });

  test("updateRecords 101件で CB_VA01", async () => {
    const records = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, record: { title: { value: "x" } } }));
    await expect(
      client.record.updateRecords({ app: appId, records }),
    ).rejects.toMatchObject({
      errors: { records: { messages: ["一度に100件までのレコードを更新できます。"] } },
    });
  });

  test("updateRecords トランザクション: 1件でも失敗すれば全件ロールバック", async () => {
    const { ids } = await client.record.addRecords({
      app: appId,
      records: [
        { title: { value: "a" }, uniq: { value: "u1" } },
        { title: { value: "b" }, uniq: { value: "u2" } },
      ],
    });
    await expect(
      client.record.updateRecords({
        app: appId,
        records: [
          { id: ids[0]!, record: { title: { value: "changed" } } },
          { id: ids[1]!, record: { title: { value: "too_long_value_exceeds_maxlength_20_chars" } } },
        ],
      }),
    ).rejects.toThrow();

    const r1 = await client.record.getRecord({ app: appId, id: ids[0]! });
    expect(r1.record.title).toMatchObject({ value: "a" });
  });

  test("updateRecords updateKey を使える", async () => {
    const { ids } = await client.record.addRecords({
      app: appId,
      records: [{ title: { value: "a" }, uniq: { value: "k1" } }],
    });
    const result = await client.record.updateRecords({
      app: appId,
      records: [{ updateKey: { field: "uniq", value: "k1" }, record: { title: { value: "by_key" } } }],
    });
    expect(result.records[0]!.revision).toBe("2");
    const r = await client.record.getRecord({ app: appId, id: ids[0]! });
    expect(r.record.title).toMatchObject({ value: "by_key" });
  });

  test("updateRecords 空配列は空のままで成功", async () => {
    const result = await client.record.updateRecords({ app: appId, records: [] });
    expect(result).toEqual({ records: [] });
  });
});

// 以下はエミュレーター固有の挙動（raw fetch / app 欠落 / Accept-Language など）
describeEmulatorOnly("一括 addRecords / updateRecords（emulator 固有）", () => {
  const SESSION = "records-bulk-emu";
  let BULK_URL: string;
  let client: KintoneRestAPIClient;

  beforeAll(() => { BULK_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(BULK_URL);
    client = new KintoneRestAPIClient({ baseUrl: BULK_URL, auth: { apiToken: "test" } });
    await client.app.addFormFields({
      app: 1,
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "title", required: true, maxLength: "20" },
      },
    });
  });
  afterEach(async () => { await finalizeSession(BULK_URL); });

  const postRecords = (body: unknown, lang?: string) =>
    fetch(`${BULK_URL}/k/v1/records.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(lang ? { "Accept-Language": lang } : {}) },
      body: JSON.stringify(body),
    });

  test("addRecords 101件 en", async () => {
    const records = Array.from({ length: 101 }, (_, i) => ({ title: { value: `x${i}` } }));
    const r = await postRecords({ app: 1, records }, "en");
    const json = await r.json();
    expect(json.errors.records).toEqual({
      messages: ["A maximum of 100 records can be added at one time."],
    });
  });

  test("addRecords で app 欠落は CB_VA01", async () => {
    const r = await postRecords({ records: [{ title: { value: "x" } }] });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors).toEqual({ app: { messages: ["必須です。"] } });
  });
});

