import { describe, expect, test } from "vitest";
import { applyFieldDefaults, fieldProperty } from "../src/field-defaults";

describe("fieldProperty()", () => {
  test("最小プロパティ（code, type）でデフォルトが補完される", () => {
    expect(fieldProperty("title", "SINGLE_LINE_TEXT")).toEqual({
      type: "SINGLE_LINE_TEXT",
      code: "title",
      label: "title",
      noLabel: false,
      required: false,
      minLength: "",
      maxLength: "",
      expression: "",
      hideExpression: false,
      unique: false,
      defaultValue: "",
    });
  });

  test("optional 属性は指定したものが優先される", () => {
    const f = fieldProperty("qty", "NUMBER", { required: true, maxValue: "100", unit: "個" });
    expect(f.required).toBe(true);
    expect(f.maxValue).toBe("100");
    expect(f.unit).toBe("個");
    // 他のデフォルトは入っている
    expect(f.minValue).toBe("");
    expect(f.digit).toBe(false);
    expect(f.unitPosition).toBe("BEFORE");
  });

  test("label を明示的に渡したら優先", () => {
    expect(fieldProperty("c", "SINGLE_LINE_TEXT", { label: "明示" }).label).toBe("明示");
  });
});

describe("applyFieldDefaults — 各 type", () => {
  test("MULTI_LINE_TEXT", () => {
    expect(applyFieldDefaults({ type: "MULTI_LINE_TEXT", code: "f", label: "f" })).toEqual({
      type: "MULTI_LINE_TEXT", code: "f", label: "f",
      noLabel: false, required: false, defaultValue: "",
    });
  });

  test("NUMBER", () => {
    const f = applyFieldDefaults({ type: "NUMBER", code: "n", label: "n" });
    expect(f).toMatchObject({
      type: "NUMBER", code: "n", label: "n",
      noLabel: false, required: false,
      minValue: "", maxValue: "", digit: false, unique: false,
      defaultValue: "", displayScale: "", unit: "", unitPosition: "BEFORE",
    });
  });

  test("CALC（defaultValue / unique なし、format=NUMBER がデフォルト）", () => {
    const f = applyFieldDefaults({ type: "CALC", code: "c", label: "c", expression: "1+1" });
    expect(f).toMatchObject({
      type: "CALC", code: "c", label: "c", expression: "1+1",
      noLabel: false, required: false,
      format: "NUMBER", displayScale: "", hideExpression: false,
      unit: "", unitPosition: "BEFORE",
    });
    expect(f).not.toHaveProperty("defaultValue");
    expect(f).not.toHaveProperty("unique");
  });

  test("DATE / DATETIME", () => {
    expect(applyFieldDefaults({ type: "DATE", code: "d", label: "d" })).toMatchObject({
      noLabel: false, required: false, unique: false, defaultValue: "", defaultNowValue: false,
    });
    expect(applyFieldDefaults({ type: "DATETIME", code: "dt", label: "dt" })).toMatchObject({
      noLabel: false, required: false, unique: false, defaultValue: "", defaultNowValue: false,
    });
  });

  test("TIME（unique なし）", () => {
    const f = applyFieldDefaults({ type: "TIME", code: "t", label: "t" });
    expect(f).toMatchObject({
      noLabel: false, required: false, defaultValue: "", defaultNowValue: false,
    });
    expect(f).not.toHaveProperty("unique");
  });

  test("LINK", () => {
    expect(applyFieldDefaults({ type: "LINK", code: "l", label: "l" })).toMatchObject({
      noLabel: false, required: false, protocol: "WEB",
      minLength: "", maxLength: "", unique: false, defaultValue: "",
    });
  });

  test("FILE（thumbnailSize のみ追加）", () => {
    const f = applyFieldDefaults({ type: "FILE", code: "f", label: "f" });
    expect(f).toEqual({
      type: "FILE", code: "f", label: "f",
      noLabel: false, required: false, thumbnailSize: "50",
    });
  });

  test("DROP_DOWN（required=false）", () => {
    const f = applyFieldDefaults({
      type: "DROP_DOWN", code: "d", label: "d",
      options: { A: { label: "A", index: "0" } },
    });
    expect(f.required).toBe(false);
    expect(f.defaultValue).toBe("");
  });

  test("RADIO_BUTTON（required=true、defaultValue は最初の option）", () => {
    const f = applyFieldDefaults({
      type: "RADIO_BUTTON", code: "r", label: "r",
      options: { B: { label: "B", index: "1" }, A: { label: "A", index: "0" } },
    });
    expect(f.required).toBe(true);
    expect(f.defaultValue).toBe("A"); // index=0 のもの
    expect(f.align).toBe("HORIZONTAL");
  });

  test("RADIO_BUTTON でユーザーが defaultValue 指定したら優先", () => {
    const f = applyFieldDefaults({
      type: "RADIO_BUTTON", code: "r", label: "r",
      options: { A: { label: "A", index: "0" }, B: { label: "B", index: "1" } },
      defaultValue: "B",
    });
    expect(f.defaultValue).toBe("B");
  });

  test("CHECK_BOX（defaultValue=[]）", () => {
    expect(applyFieldDefaults({
      type: "CHECK_BOX", code: "c", label: "c",
      options: { A: { label: "A", index: "0" } },
    })).toMatchObject({
      defaultValue: [], align: "HORIZONTAL", required: false,
    });
  });

  test("MULTI_SELECT（align なし）", () => {
    const f = applyFieldDefaults({
      type: "MULTI_SELECT", code: "m", label: "m",
      options: { A: { label: "A", index: "0" } },
    });
    expect(f.defaultValue).toEqual([]);
    expect(f).not.toHaveProperty("align");
  });

  test("USER_SELECT", () => {
    expect(applyFieldDefaults({ type: "USER_SELECT", code: "u", label: "u" })).toMatchObject({
      noLabel: false, required: false, entities: [], defaultValue: [],
    });
  });

  test("LOOKUP (SLT + lookup)：基底 type のデフォルトは入らず、lookup の defaults のみ", () => {
    const f = applyFieldDefaults({
      type: "SINGLE_LINE_TEXT", code: "lk", label: "lk",
      lookup: {
        relatedApp: { app: "12" },
        relatedKeyField: "code",
        fieldMappings: [{ field: "dest", relatedField: "name" }],
      },
    });
    expect(f).toEqual({
      type: "SINGLE_LINE_TEXT", code: "lk", label: "lk",
      noLabel: false, required: false,
      lookup: {
        relatedApp: { app: "12", code: "" },
        relatedKeyField: "code",
        fieldMappings: [{ field: "dest", relatedField: "name" }],
        lookupPickerFields: [],
        filterCond: "",
        sort: "レコード番号 desc",
      },
    });
    // 基底 SLT のデフォルト（minLength 等）は入らない
    expect(f).not.toHaveProperty("minLength");
    expect(f).not.toHaveProperty("defaultValue");
  });

  test("LOOKUP (NUMBER + lookup)：基底 type のデフォルトは入らない", () => {
    const f = applyFieldDefaults({
      type: "NUMBER", code: "lk", label: "lk",
      lookup: {
        relatedApp: { app: "12" }, relatedKeyField: "price",
        fieldMappings: [{ field: "dest", relatedField: "price" }],
        lookupPickerFields: ["price"],
      },
    });
    expect(f).not.toHaveProperty("minValue");
    expect(f).not.toHaveProperty("digit");
    expect((f.lookup as Record<string, unknown>).filterCond).toBe("");
    expect((f.lookup as Record<string, unknown>).sort).toBe("レコード番号 desc");
  });

  test("LOOKUP の lookup 内属性をユーザーが指定したら優先", () => {
    const f = applyFieldDefaults({
      type: "SINGLE_LINE_TEXT", code: "lk", label: "lk",
      lookup: {
        relatedApp: { app: "12", code: "MASTER" },
        relatedKeyField: "code",
        fieldMappings: [],
        lookupPickerFields: ["a", "b"],
        filterCond: 'status in ("active")',
        sort: "price desc",
      },
    });
    const lk = f.lookup as Record<string, unknown>;
    expect(lk.lookupPickerFields).toEqual(["a", "b"]);
    expect(lk.filterCond).toBe('status in ("active")');
    expect(lk.sort).toBe("price desc");
    expect(lk.relatedApp).toEqual({ app: "12", code: "MASTER" });
  });

  test("REFERENCE_TABLE：required なし、referenceTable のデフォルト補完", () => {
    const f = applyFieldDefaults({
      type: "REFERENCE_TABLE", code: "rt", label: "rt",
      referenceTable: {
        relatedApp: { app: "12" },
        condition: { field: "key", relatedField: "code" },
        displayFields: ["name"],
      },
    });
    expect(f).not.toHaveProperty("required");
    expect(f.noLabel).toBe(false);
    expect(f.referenceTable).toEqual({
      relatedApp: { app: "12", code: "" },
      condition: { field: "key", relatedField: "code" },
      displayFields: ["name"],
      filterCond: "",
      sort: "レコード番号 desc",
      size: "5",
    });
  });

  test("SUBTABLE（required を持たず、内部 fields は再帰補完）", () => {
    const f = applyFieldDefaults({
      type: "SUBTABLE", code: "items", label: "items",
      fields: { qty: { type: "NUMBER", code: "qty", label: "qty" } },
    });
    expect(f).not.toHaveProperty("required");
    expect(f.noLabel).toBe(false);
    const inner = (f.fields as Record<string, Record<string, unknown>>).qty;
    expect(inner).toMatchObject({
      type: "NUMBER", code: "qty",
      noLabel: false, required: false, minValue: "", digit: false,
    });
  });
});
