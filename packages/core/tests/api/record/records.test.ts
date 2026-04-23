import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

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
        test: { type: "SINGLE_LINE_TEXT", code: "test", label: "Test" },
        test2: { type: "SINGLE_LINE_TEXT", code: "test2", label: "Test2" },
        postedAt: { type: "DATETIME", code: "postedAt", label: "Posted At" },
        テスト: { type: "SINGLE_LINE_TEXT", code: "テスト", label: "テスト" },
        理由: { type: "SINGLE_LINE_TEXT", code: "理由", label: "理由" },
        理由_new: { type: "SINGLE_LINE_TEXT", code: "理由_new", label: "理由_new" },
        日時: { type: "DATETIME", code: "日時", label: "日時" },
        ステータス: {
          type: "DROP_DOWN",
          code: "ステータス",
          label: "ステータス",
          options: {
            あ: { label: "あ", index: "0" },
            い: { label: "い", index: "1" },
            う: { label: "う", index: "2" },
          },
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
    // 実 kintone はデフォルトで $id desc なので id=2 が先頭
    expect(records.records[0]!["$id"]!.value).toEqual("2");
    expect(records.records[0]!.test!.value).toEqual("test2");
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

describe("SUBTABLE 内フィールドでの検索クエリ", () => {
  const SESSION = "records-subtable-query";
  let URL_BASE: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => { URL_BASE = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(URL_BASE);
    client = new KintoneRestAPIClient({ baseUrl: URL_BASE, auth: { apiToken: "test" } });
    appId = await createApp(URL_BASE, {
      name: "subtable query",
      properties: {
        top_title: { type: "SINGLE_LINE_TEXT", code: "top_title", label: "top" },
        items: {
          type: "SUBTABLE", code: "items", label: "items",
          fields: {
            name: { type: "SINGLE_LINE_TEXT", code: "name", label: "name" },
            qty:  { type: "NUMBER", code: "qty", label: "qty" },
          },
        },
      },
      records: [
        { top_title: { value: "r1" }, items: { value: [
          { value: { name: { value: "apple" },  qty: { value: "100" } } },
          { value: { name: { value: "orange" }, qty: { value: "200" } } },
        ] } },
        { top_title: { value: "r2" }, items: { value: [
          { value: { name: { value: "shared" }, qty: { value: "50" } } },
        ] } },
        { top_title: { value: "r3" }, items: { value: [] } },
      ],
    });
  });
  afterEach(async () => { await finalizeSession(URL_BASE); });

  test("SUBTABLE 内フィールド in で 1 行でもマッチするレコードが返る", async () => {
    const { records } = await client.record.getRecords({
      app: appId, query: 'name in ("apple")',
    });
    expect(records).toHaveLength(1);
    expect(records[0]!.top_title!.value).toBe("r1");
  });

  test("SUBTABLE 内フィールド > で数値比較", async () => {
    const { records } = await client.record.getRecords({
      app: appId, query: "qty > 50",
    });
    // r1 の行2 (200) がマッチするので r1 だけ
    expect(records.map((r) => r.top_title!.value).sort()).toEqual(["r1"]);
  });

  test("同一 SUBTABLE の AND は同一行制約を満たすレコードが返る", async () => {
    // r1 の行1 に apple/100 が揃っているのでヒット
    const { records } = await client.record.getRecords({
      app: appId, query: 'name in ("apple") and qty in ("100")',
    });
    expect(records.map((r) => r.top_title!.value)).toEqual(["r1"]);
  });

  test("同一 SUBTABLE の AND で別行の組み合わせはヒットしない", async () => {
    // r1 は apple(行1) と 200(行2) を別々の行に持つので、同一行制約によりヒットしない
    const { records } = await client.record.getRecords({
      app: appId, query: 'name in ("apple") and qty in ("200")',
    });
    expect(records).toHaveLength(0);
  });

  test("not in は全行条件（r1 は shared を含まないので返る、r2 は shared を含むので返らない）", async () => {
    const { records } = await client.record.getRecords({
      app: appId, query: 'name not in ("shared")',
    });
    expect(records.map((r) => r.top_title!.value).sort()).toEqual(["r1"]);
  });

  test("top-level と SUBTABLE の混合クエリ", async () => {
    const { records } = await client.record.getRecords({
      app: appId, query: 'top_title = "r1" and name in ("apple")',
    });
    expect(records).toHaveLength(1);
    expect(records[0]!.top_title!.value).toBe("r1");
  });
});

describe("システムフィールドコードでの検索クエリ", () => {
  const SESSION = "records-system-fields-query";
  let QUERY_URL: string;
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(() => { QUERY_URL = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(QUERY_URL);
    client = new KintoneRestAPIClient({ baseUrl: QUERY_URL, auth: { apiToken: "test" } });
    // setup/app.json 経由で作ることでシステムフィールド（レコード番号等）が自動補完される
    appId = await createApp(QUERY_URL, {
      name: "system fields query",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "title" } },
      records: [
        { title: { value: "A" } },
        { title: { value: "B" } },
        { title: { value: "C" } },
      ],
    });
  });
  afterEach(async () => { await finalizeSession(QUERY_URL); });

  test("レコード番号フィールドコードで = クエリできる", async () => {
    const { records } = await client.record.getRecords({
      app: appId, query: 'レコード番号 = "2"',
    });
    expect(records).toHaveLength(1);
    expect(records[0]!.title!.value).toBe("B");
  });

  test("レコード番号フィールドコードで order by できる", async () => {
    const { records } = await client.record.getRecords({
      app: appId, query: "order by レコード番号 desc",
    });
    expect(records.map((r) => r.title!.value)).toEqual(["C", "B", "A"]);
  });

  test("アンダースコアを含む日本語混在フィールドコードで = クエリが動作する", async () => {
    const app2 = await createApp(QUERY_URL, {
      name: "mixed field code",
      properties: {
        文字列__1行_: { type: "SINGLE_LINE_TEXT", code: "文字列__1行_", label: "mixed" },
      },
      records: [{ 文字列__1行_: { value: "テスト値" } }],
    });
    const { records } = await client.record.getRecords({
      app: app2, query: '文字列__1行_ = "テスト値"',
    });
    expect(records).toHaveLength(1);
    expect((records[0] as Record<string, { value: unknown }>).文字列__1行_!.value).toBe("テスト値");
  });
});

describe("クエリのエラーレスポンス / 上限チェック", () => {
  const SESSION = "records-query-errors";
  let URL_BASE: string;

  beforeAll(() => { URL_BASE = createBaseUrl(SESSION); });
  beforeEach(async () => {
    await initializeSession(URL_BASE);
    await createApp(URL_BASE, {
      name: "query errors",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "t" } },
    });
  });
  afterEach(async () => { await finalizeSession(URL_BASE); });

  const fetchRecords = (query: string) =>
    fetch(`${URL_BASE}/k/v1/records.json?app=1&${new URLSearchParams({ query }).toString()}`);

  test("構文エラーは CB_VA01 + errors.query.messages", async () => {
    const r = await fetchRecords("title ===");
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("CB_VA01");
    expect(json.errors).toEqual({
      query: { messages: ["クエリ記法が間違っています。"] },
    });
  });

  test("文字列リテラル内の生タブで CB_VA01", async () => {
    const r = await fetchRecords('title = "a\tb"');
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("CB_VA01");
  });

  test("limit > 500 で GAIA_QU01", async () => {
    const r = await fetchRecords("limit 1000");
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("GAIA_QU01");
    expect(json.message).toContain("500");
  });

  test("offset > 10000 で GAIA_QU02", async () => {
    const r = await fetchRecords("offset 99999");
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("GAIA_QU02");
    expect(json.message).toContain("10,000");
  });

  test("存在しないフィールドで GAIA_IQ11", async () => {
    const r = await fetchRecords('xyz = "a"');
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("GAIA_IQ11");
    expect(json.message).toContain("xyz");
  });

  test("SUBTABLE 内フィールドへの = は GAIA_IQ07", async () => {
    await fetch(`${URL_BASE}/k/v1/preview/app/form/fields.json`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: 1,
        properties: {
          items: {
            type: "SUBTABLE", code: "items", label: "items",
            fields: { name: { type: "SINGLE_LINE_TEXT", code: "name", label: "name" } },
          },
        },
      }),
    });
    const r = await fetchRecords('name = "x"');
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("GAIA_IQ07");
    expect(json.message).toContain("テーブル");
    expect(json.message).toContain("name");
  });

  test("MULTI_LINE_TEXT / RICH_TEXT に = は GAIA_IQ03", async () => {
    // 追加フィールドなしで app 1 にフォームフィールド追加
    await fetch(`${URL_BASE}/k/v1/preview/app/form/fields.json`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: 1,
        properties: { memo: { type: "MULTI_LINE_TEXT", code: "memo", label: "memo" } },
      }),
    });
    const r = await fetchRecords('memo = "foo"');
    expect(r.status).toBe(400);
    const json = await r.json();
    expect(json.code).toBe("GAIA_IQ03");
    expect(json.message).toContain("memo");
    expect(json.message).toContain("=");
  });
});
