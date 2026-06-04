import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeEach, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

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

  test("DROP_DOWN: 未選択は value:null として保存・返却される（実 kintone 準拠）", async () => {
    const { appId: ddAppId } = await createTestApp(SESSION, {
      name: "drop_down null",
      properties: {
        dd: {
          type: "DROP_DOWN",
          code: "dd",
          label: "dd",
          options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } },
        },
      },
    });

    // 未送信
    const r1 = await client.record.addRecord({ app: ddAppId, record: {} });
    const got1 = await client.record.getRecord({ app: ddAppId, id: r1.id });
    expect(got1.record.dd).toEqual({ type: "DROP_DOWN", value: null });

    // 明示的に value: "" → null に正規化
    const r2 = await client.record.addRecord({
      app: ddAppId,
      // SDK の型は string なので as でキャストして空文字列を送る
      record: { dd: { value: "" as string } },
    });
    const got2 = await client.record.getRecord({ app: ddAppId, id: r2.id });
    expect(got2.record.dd).toEqual({ type: "DROP_DOWN", value: null });

    // PUT で value: "" を送ったら null に正規化
    const r3 = await client.record.addRecord({ app: ddAppId, record: { dd: { value: "A" } } });
    await client.record.updateRecord({
      app: ddAppId,
      id: r3.id,
      record: { dd: { value: "" as string } },
    });
    const got3 = await client.record.getRecord({ app: ddAppId, id: r3.id });
    expect(got3.record.dd).toEqual({ type: "DROP_DOWN", value: null });
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

