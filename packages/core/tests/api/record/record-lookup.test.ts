import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { createTestApp, describeDualMode, describeEmulatorOnly, getTestClient, resetTestEnvironment } from "../../real-kintone";

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

describeDualMode("SUBTABLE 内 LOOKUP", () => {
  const SESSION = "subtable-lookup";
  let client: KintoneRestAPIClient;
  let masterAppId: number;
  let lookupAppId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);

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
      ],
    }));

    ({ appId: lookupAppId } = await createTestApp(SESSION, {
      name: "注文（明細）",
      properties: {
        items: {
          type: "SUBTABLE", code: "items", label: "明細",
          fields: {
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
                filterCond: "", sort: "",
              },
            },
            prod_name:  { type: "SINGLE_LINE_TEXT", code: "prod_name",  label: "商品名" },
            prod_price: { type: "NUMBER",           code: "prod_price", label: "価格" },
            qty:        { type: "NUMBER",           code: "qty",        label: "数量" },
          },
        },
      },
    }));
  });

  test("各行のキーが解決され、同じ行のコピー先が埋まる", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: {
        items: { value: [
          { value: { prod_code: { value: "P001" }, qty: { value: "5" } } },
          { value: { prod_code: { value: "P002" }, qty: { value: "3" } } },
        ] },
      },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    const rows = record.items!.value as Array<{ value: Record<string, { value: unknown }> }>;
    expect(rows[0]!.value.prod_name).toMatchObject({ value: "りんご" });
    expect(rows[0]!.value.prod_price).toMatchObject({ value: "100" });
    expect(rows[1]!.value.prod_name).toMatchObject({ value: "みかん" });
    expect(rows[1]!.value.prod_price).toMatchObject({ value: "80" });
  });

  test("行内のキーが空ならその行のコピー先も空", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: {
        items: { value: [
          { value: { prod_code: { value: "" }, qty: { value: "1" } } },
        ] },
      },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    const rows = record.items!.value as Array<{ value: Record<string, { value: unknown }> }>;
    expect(rows[0]!.value.prod_name).toMatchObject({ value: "" });
    expect(rows[0]!.value.prod_price).toMatchObject({ value: "" });
  });

  test("キー不一致は GAIA_LO04", async () => {
    await expect(
      client.record.addRecord({
        app: lookupAppId, record: {
          items: { value: [
            { value: { prod_code: { value: "ZZZ" } } },
          ] },
        },
      }),
    ).rejects.toMatchObject({ code: "GAIA_LO04" });
  });

  test("行ごとに別キーが解決される（混在）", async () => {
    const { id } = await client.record.addRecord({
      app: lookupAppId, record: {
        items: { value: [
          { value: { prod_code: { value: "P001" } } },
          { value: { prod_code: { value: "" } } },
          { value: { prod_code: { value: "P002" } } },
        ] },
      },
    });
    const { record } = await client.record.getRecord({ app: lookupAppId, id });
    const rows = record.items!.value as Array<{ value: Record<string, { value: unknown }> }>;
    expect(rows[0]!.value.prod_name).toMatchObject({ value: "りんご" });
    expect(rows[1]!.value.prod_name).toMatchObject({ value: "" });
    expect(rows[2]!.value.prod_name).toMatchObject({ value: "みかん" });
  });
});
