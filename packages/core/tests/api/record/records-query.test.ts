import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeEach, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

describeDualMode("SUBTABLE 内フィールドでの検索クエリ", () => {
  const SESSION = "records-subtable-query";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
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
    }));
  });

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

describeDualMode("システムフィールドコードでの検索クエリ", () => {
  const SESSION = "records-system-fields-query";
  let client: KintoneRestAPIClient;
  let appId: number;
  let recordIds: number[];

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId, recordIds } = await createTestApp(SESSION, {
      name: "system fields query",
      properties: { title: { type: "SINGLE_LINE_TEXT", code: "title", label: "title" } },
      records: [
        { title: { value: "A" } },
        { title: { value: "B" } },
        { title: { value: "C" } },
      ],
    }));
    // emulator は createTestApp が recordIds を返さないので getRecords で取り直す
    if (recordIds.length === 0) {
      const all = await client.record.getRecords({
        app: appId, query: "order by $id asc",
      });
      recordIds = all.records.map((r) => Number(r.$id!.value));
    }
  });

  test("レコード番号フィールドコードで = クエリできる", async () => {
    // recordIds[1] は 2番目のレコード（title=B）
    const { records } = await client.record.getRecords({
      app: appId, query: `レコード番号 = "${recordIds[1]}"`,
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
    const { appId: app2 } = await createTestApp(SESSION, {
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

describeDualMode("クエリのエラーレスポンス / 上限チェック", () => {
  const SESSION = "records-query-errors";
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "query errors",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "t" },
        memo:  { type: "MULTI_LINE_TEXT",  code: "memo",  label: "memo" },
        items: {
          type: "SUBTABLE", code: "items", label: "items",
          fields: { name: { type: "SINGLE_LINE_TEXT", code: "name", label: "name" } },
        },
        cb: {
          type: "CHECK_BOX", code: "cb", label: "cb",
          options: {
            opt1: { label: "opt1", index: "0" },
            opt2: { label: "opt2", index: "1" },
          },
        },
      },
    }));
  });

  test("構文エラーは CB_VA01", async () => {
    await expect(
      client.record.getRecords({ app: appId, query: "title ===" }),
    ).rejects.toMatchObject({ code: "CB_VA01" });
  });

  test("文字列リテラル内の生タブで CB_VA01", async () => {
    await expect(
      client.record.getRecords({ app: appId, query: 'title = "a\tb"' }),
    ).rejects.toMatchObject({ code: "CB_VA01" });
  });

  test("limit > 500 で GAIA_QU01", async () => {
    await expect(
      client.record.getRecords({ app: appId, query: "limit 1000" }),
    ).rejects.toMatchObject({ code: "GAIA_QU01" });
  });

  test("offset > 10000 で GAIA_QU02", async () => {
    await expect(
      client.record.getRecords({ app: appId, query: "offset 99999" }),
    ).rejects.toMatchObject({ code: "GAIA_QU02" });
  });

  test("存在しないフィールドで GAIA_IQ11", async () => {
    await expect(
      client.record.getRecords({ app: appId, query: 'xyz = "a"' }),
    ).rejects.toMatchObject({ code: "GAIA_IQ11" });
  });

  test("SUBTABLE 内フィールドへの = は GAIA_IQ07", async () => {
    await expect(
      client.record.getRecords({ app: appId, query: 'name = "x"' }),
    ).rejects.toMatchObject({ code: "GAIA_IQ07" });
  });

  test("MULTI_LINE_TEXT / RICH_TEXT に = は GAIA_IQ03", async () => {
    await expect(
      client.record.getRecords({ app: appId, query: 'memo = "foo"' }),
    ).rejects.toMatchObject({ code: "GAIA_IQ03" });
  });

  test("CHECK_BOX 等の選択肢に無い値を指定すると GAIA_IQ10", async () => {
    await expect(
      client.record.getRecords({ app: appId, query: 'cb in ("unknown")' }),
    ).rejects.toMatchObject({ code: "GAIA_IQ10" });
  });
});
