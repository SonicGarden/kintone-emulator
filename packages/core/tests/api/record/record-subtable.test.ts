import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeEach, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment, testEmulatorOnly } from "../../real-kintone";

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

  test("既存行 id を指定した PUT は内部フィールドをマージ（送らないフィールドは保持）", async () => {
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

  test("存在しない行 id を指定すると新規行として新しい id が振られる", async () => {
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

