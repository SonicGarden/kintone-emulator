import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("records");
});

describe("アプリのレコード一覧のAPI", () => {
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
        test2: {
          type: "SINGLE_LINE_TEXT",
          code: "test2",
          label: "Test2",
        },
        postedAt: {
          type: "DATETIME",
          code: "postedAt",
          label: "Posted At",
        },
      },
    });
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  test("アプリのレコードを検索するとデータが返ってくる", async () => {
    const result = await client!.record.addRecord({
      app: 1,
      record: {
        test: {
          value: "test",
        },
      },
    });
    await client!.record.addRecord({
      app: 1,
      record: {
        test: {
          value: "test2",
        },
      },
    });
    expect(result).toEqual({
      id: expect.any(String),
      revision: "1",
    });
    const records = await client!.record.getRecords({
      app: 1,
    });
    expect(records.totalCount).toEqual("2");
    expect(records.records[0]!["$id"]!.value).toEqual("1");
    expect(records.records[0]!.test!.value).toEqual("test");
    expect(records.records[0]!.test!.type).toEqual("SINGLE_LINE_TEXT");
  });

  test("fieldsを指定するとそこのデータだけ出力される", async () => {
    await Promise.all([
      client!.record.addRecord({
        app: 1,
        record: {
          test: {
            value: "test",
          },
          test2: {
            value: "test",
          },
          postedAt: {
            value: "2022-01-01T00:00:00Z",
          },
        },
      }),
    ]);
    const records = await client!.record.getRecords({
      app: 1,
      fields: ["test"],
    });
    expect(records.records[0]!).not.toHaveProperty("test2");
  });

  describe("queryが存在する時、", () => {
    beforeEach(async () => {
      await Promise.all([
        client!.record.addRecord({
          app: 1,
          record: {
            test: {
              value: "test",
            },
            test2: {
              value: "test",
            },
            postedAt: {
              value: "2022-01-01T00:00:00Z",
            },
            テスト: {
              value: "テスト",
            },
          },
        }),
        await client!.record.addRecord({
          app: 1,
          record: {
            test: {
              value: "test2",
            },
            test2: {
              value: "test2",
            },
            postedAt: {
              value: "2100-01-01T00:00:00Z",
            },
            テスト: {
              value: "テスト2",
            },
          },
        }),
      ]);
    });

    test("1つの=の式", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "test = 'test'",
      });
      expect(records.totalCount).toEqual("1");
    });
    test("2つの=の式", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "test = 'test' or test2 = 'test2'",
      });
      expect(records.totalCount).toEqual("2");
    });
    test("!=の式", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "test != 'test'",
      });
      expect(records.totalCount).toEqual("1");
    });
    test("NOW()を使った場合", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "postedAt < NOW()",
      });
      expect(records.totalCount).toEqual("1");
    });
    test("order byを指定する", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "order by test desc",
      });
      expect(records.totalCount).toEqual("2");
      expect(records.records[0]!.test!.value).toEqual("test2");
    });
    test("idを指定する", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "$id = 1",
      });
      expect(records.totalCount).toEqual("1");
    });
    test("日本語のフィールドで検索する", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "テスト = 'テスト'",
      });
      expect(records.totalCount).toEqual("1");
    });
    test("日本語フィールドが複数ある場合で検索する", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: "テスト = 'テスト' or テスト = 'テスト2'",
      });
      expect(records.totalCount).toEqual("2");
    });
    test('"で囲った値で検索する', async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query: 'test = "test"',
      });
      expect(records.totalCount).toEqual("1");
    });
    test("複雑なクエリで検索する", async () => {
      const records = await client!.record.getRecords({
        app: 1,
        query:
          '((理由 in ("") and 理由_new in ("")) or 日時 != "" ) and 日時 = "" and 理由 in ("") and ステータス in ("あ","い","う")',
      });
      expect(records.totalCount).toEqual("0");
    });
  });

  describe("レコード削除", () => {
    test("レコードを削除できる", async () => {
      const { id: id1 } = await client!.record.addRecord({
        app: 1,
        record: { test: { value: "test1" } },
      });
      const { id: id2 } = await client!.record.addRecord({
        app: 1,
        record: { test: { value: "test2" } },
      });

      await client!.record.deleteRecords({
        app: 1,
        ids: [Number(id1), Number(id2)],
      });

      const records = await client!.record.getRecords({ app: 1 });
      expect(records.totalCount).toEqual("0");
    });

    test("一部のレコードだけ削除できる", async () => {
      const { id: id1 } = await client!.record.addRecord({
        app: 1,
        record: { test: { value: "test1" } },
      });
      await client!.record.addRecord({
        app: 1,
        record: { test: { value: "test2" } },
      });

      await client!.record.deleteRecords({
        app: 1,
        ids: [Number(id1)],
      });

      const records = await client!.record.getRecords({ app: 1 });
      expect(records.totalCount).toEqual("1");
      expect(records.records[0]!.test!.value).toEqual("test2");
    });

    // NOTE: kintone 実仕様では存在しないIDに対し GAIA_RE01 エラーを返すが、このエミュレーターでは無視する
    test("存在しないレコードIDを指定してもエラーにならない", async () => {
      await client!.record.addRecord({
        app: 1,
        record: { test: { value: "test1" } },
      });

      await expect(
        client!.record.deleteRecords({
          app: 1,
          ids: [9999],
        })
      ).resolves.not.toThrow();

      const records = await client!.record.getRecords({ app: 1 });
      expect(records.totalCount).toEqual("1");
    });
  });
});

describe("一括 addRecords / updateRecords", () => {
  const SESSION = "records-bulk";
  let BULK_URL: string;
  let client: KintoneRestAPIClient;

  beforeAll(() => {
    BULK_URL = createBaseUrl(SESSION);
  });

  beforeEach(async () => {
    await initializeSession(BULK_URL);
    client = new KintoneRestAPIClient({ baseUrl: BULK_URL, auth: { apiToken: "test" } });
    await client.app.addFormFields({
      app: 1,
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "title", required: true, maxLength: "20" },
        num:   { type: "NUMBER",           code: "num",   label: "num",   maxValue: "1000" },
        uniq:  { type: "SINGLE_LINE_TEXT", code: "uniq",  label: "uniq",  unique: true },
        def:   { type: "SINGLE_LINE_TEXT", code: "def",   label: "def",   defaultValue: "d" },
      },
    });
  });

  afterEach(async () => { await finalizeSession(BULK_URL); });

  const postRecords = (body: unknown) =>
    fetch(`${BULK_URL}/k/v1/records.json`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  const putRecords = (body: unknown) =>
    fetch(`${BULK_URL}/k/v1/records.json`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

  test("addRecords 正常: ids / revisions が返る", async () => {
    const result = await client.record.addRecords({
      app: 1,
      records: [
        { title: { value: "a" }, uniq: { value: "u1" } },
        { title: { value: "b" }, uniq: { value: "u2" } },
        { title: { value: "c" }, uniq: { value: "u3" } },
      ],
    });
    expect(result.ids).toEqual(["1", "2", "3"]);
    expect(result.revisions).toEqual(["1", "1", "1"]);
  });

  test("addRecords で defaultValue が補完される", async () => {
    const { ids } = await client.record.addRecords({
      app: 1,
      records: [{ title: { value: "a" } }, { title: { value: "b" }, def: { value: "override" } }],
    });
    const r1 = await client.record.getRecord({ app: 1, id: ids[0]! });
    const r2 = await client.record.getRecord({ app: 1, id: ids[1]! });
    expect(r1.record.def).toMatchObject({ value: "d" });
    expect(r2.record.def).toMatchObject({ value: "override" });
  });

  test("addRecords 空配列は空のままで成功", async () => {
    const result = await client.record.addRecords({ app: 1, records: [] });
    expect(result.ids).toEqual([]);
    expect(result.revisions).toEqual([]);
  });

  test("addRecords 101件で CB_VA01 が返る", async () => {
    const records = Array.from({ length: 101 }, (_, i) => ({ title: { value: `x${i}` } }));
    const r = await postRecords({ app: 1, records });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors.records).toEqual({
      messages: ["一度に100件までのレコードを追加できます。"],
    });
  });

  test("addRecords 101件 en", async () => {
    const records = Array.from({ length: 101 }, (_, i) => ({ title: { value: `x${i}` } }));
    const r = await fetch(`${BULK_URL}/k/v1/records.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": "en" },
      body: JSON.stringify({ app: 1, records }),
    });
    const json = await r.json();
    expect(json.errors.records).toEqual({
      messages: ["A maximum of 100 records can be added at one time."],
    });
  });

  test("addRecords validation 失敗時は index 付きキーで errors", async () => {
    const r = await postRecords({
      app: 1,
      records: [
        { title: { value: "ok1" } },
        { num: { value: "5" } },          // title 欠落
        { title: { value: "ok3" } },
      ],
    });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors).toEqual({
      "records[1].title.value": { messages: ["必須です。"] },
    });
  });

  test("addRecords トランザクション: 1件でも失敗すれば全件ロールバック", async () => {
    await client.record.addRecord({ app: 1, record: { title: { value: "pre" }, uniq: { value: "u1" } } });

    const r = await postRecords({
      app: 1,
      records: [
        { title: { value: "a" }, uniq: { value: "u2" } },
        { title: { value: "b" }, uniq: { value: "u1" } },  // 重複
      ],
    });
    expect(r.status).toBe(400);

    // ロールバック確認: uniq=u2 のレコードは保存されていない
    const all = await client.record.getRecords({ app: 1, query: "order by $id asc" });
    expect(all.records).toHaveLength(1);
    expect(all.records[0]!.uniq).toMatchObject({ value: "u1" });
  });

  test("addRecords で app 欠落は CB_VA01", async () => {
    const r = await postRecords({ records: [{ title: { value: "x" } }] });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors).toEqual({ app: { messages: ["必須です。"] } });
  });

  test("updateRecords 正常: records[] に {id, revision}", async () => {
    const { ids } = await client.record.addRecords({
      app: 1,
      records: [
        { title: { value: "a" }, uniq: { value: "u1" } },
        { title: { value: "b" }, uniq: { value: "u2" } },
      ],
    });
    const result = await client.record.updateRecords({
      app: 1,
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
    const r = await putRecords({
      app: 1,
      records: [{ id: 99999, record: { title: { value: "x" } } }],
    });
    expect(r.status).toBe(404);
    const json = await r.json();
    expect(json.code).toBe("GAIA_RE01");
  });

  test("updateRecords validation 失敗は index 付きキー", async () => {
    const { ids } = await client.record.addRecords({
      app: 1,
      records: [
        { title: { value: "a" }, uniq: { value: "u1" } },
        { title: { value: "b" }, uniq: { value: "u2" } },
      ],
    });
    const r = await putRecords({
      app: 1,
      records: [
        { id: ids[0], record: { title: { value: "ok" } } },
        { id: ids[1], record: { title: { value: "too_long_value_exceeds_maxlength_20_chars" } } },
      ],
    });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors).toEqual({
      "records[1].title.value": { messages: ["21文字より短くなければなりません。"] },
    });
  });

  test("updateRecords 101件で CB_VA01", async () => {
    const records = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, record: { title: { value: "x" } } }));
    const r = await putRecords({ app: 1, records });
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.errors.records).toEqual({
      messages: ["一度に100件までのレコードを更新できます。"],
    });
  });

  test("updateRecords トランザクション: 1件でも失敗すれば全件ロールバック", async () => {
    const { ids } = await client.record.addRecords({
      app: 1,
      records: [
        { title: { value: "a" }, uniq: { value: "u1" } },
        { title: { value: "b" }, uniq: { value: "u2" } },
      ],
    });
    const r = await putRecords({
      app: 1,
      records: [
        { id: ids[0], record: { title: { value: "changed" } } },
        { id: ids[1], record: { title: { value: "too_long_value_exceeds_maxlength_20_chars" } } },
      ],
    });
    expect(r.status).toBe(400);

    const r1 = await client.record.getRecord({ app: 1, id: ids[0]! });
    expect(r1.record.title).toMatchObject({ value: "a" });
  });

  test("updateRecords updateKey を使える", async () => {
    await client.record.addRecords({
      app: 1,
      records: [{ title: { value: "a" }, uniq: { value: "k1" } }],
    });
    const result = await client.record.updateRecords({
      app: 1,
      records: [{ updateKey: { field: "uniq", value: "k1" }, record: { title: { value: "by_key" } } }],
    });
    expect(result.records[0]!.revision).toBe("2");
    const r = await client.record.getRecord({ app: 1, id: "1" });
    expect(r.record.title).toMatchObject({ value: "by_key" });
  });

  test("updateRecords 空配列は空のままで成功", async () => {
    const result = await client.record.updateRecords({ app: 1, records: [] });
    expect(result).toEqual({ records: [] });
  });
});
