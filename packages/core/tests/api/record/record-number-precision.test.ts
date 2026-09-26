import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeAll, describe, expect, test } from "vitest";
import type { NumberPrecision } from "../../../src/query/number";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

// NUMBER の保存値の正規化・丸め・桁数検証 (doc/kintone-behavior-notes.md「NUMBER の保存値」)。
// 実 kintone は精度を変えるたびに deploy が要るので、精度ごとに beforeAll で 1 度だけアプリを作る

type Written = string | { error: string; key: string; message: string };

const setup = async (session: string, numberPrecision?: NumberPrecision) => {
  await resetTestEnvironment(session);
  const client = getTestClient(session);
  const { appId } = await createTestApp(session, {
    name: "number precision",
    properties: {
      n: { type: "NUMBER", code: "n", label: "n" },
      r: { type: "NUMBER", code: "r", label: "r", maxValue: "10", minValue: "-5" },
      items: {
        type: "SUBTABLE", code: "items", label: "items",
        fields: { qty: { type: "NUMBER", code: "qty", label: "qty" } },
      },
    },
    numberPrecision,
  });
  return { client, appId };
};

const toWritten = (e: unknown): Written => {
  const errors = (e as { errors?: Record<string, { messages: string[] }> }).errors ?? {};
  const [key, value] = Object.entries(errors)[0] ?? ["", { messages: [""] }];
  return { error: (e as { code?: string }).code ?? "", key, message: value.messages[0]! };
};

/** top-level の n に書いて読み返した値、またはエラー */
const writeTop = async (client: KintoneRestAPIClient, app: number, field: "n" | "r", v: string): Promise<Written> => {
  try {
    const { id } = await client.record.addRecord({ app, record: { [field]: { value: v } } });
    const { record } = await client.record.getRecord({ app, id });
    return record[field]!.value as string;
  } catch (e) {
    return toWritten(e);
  }
};

/** SUBTABLE 内の qty に書いて読み返した値、またはエラー */
const writeSub = async (client: KintoneRestAPIClient, app: number, v: string): Promise<Written> => {
  try {
    const { id } = await client.record.addRecord({
      app, record: { items: { value: [{ value: { qty: { value: v } } }] } } as never,
    });
    const { record } = await client.record.getRecord({ app, id });
    return (record.items!.value as unknown as Array<{ value: { qty: { value: string } } }>)[0]!.value.qty.value;
  } catch (e) {
    return toWritten(e);
  }
};

const DIGITS = "有効桁数を超えています。";
const NAN = { messages: ["数字でなければなりません。"] };
const topDigitsError = { error: "CB_VA01", key: "record.n.value", message: DIGITS };
const subDigitsError = { error: "CB_VA01", key: "record.items.value[0].value.qty.value", message: DIGITS };

describeDualMode("NUMBER の保存値: 既定の数値精度 (16 桁 / 小数 4 桁 / HALF_EVEN)", () => {
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(async () => {
    ({ client, appId } = await setup("record-number-precision-default"));
  }, 120_000);

  describe.each(["top", "sub"] as const)("%s", (where) => {
    const write = (v: string) => (where === "top" ? writeTop(client, appId, "n", v) : writeSub(client, appId, v));

    test.each([
      ["0.00015", "0.0002"],
      ["0.00025", "0.0002"],
      ["0.00035", "0.0004"],
      ["-0.00015", "-0.0002"],
      // 丸めて 0 になったら符号は残らない
      ["-0.00005", "0"],
      ["1.23456", "1.2346"],
      ["12.3456789", "12.3457"],
      ["1e-7", "0"],
    ])("小数第 5 位以下は丸める: %s → %s", async (input, expected) => {
      expect(await write(input)).toBe(expected);
    });

    test.each([
      ["1e-4", "0.0001"],
      ["1.5e-3", "0.0015"],
      ["1e11", "100000000000"],
      ["1e+3", "1000"],
      ["00012.50", "12.5"],
      ["5.", "5"],
      ["123456789012", "123456789012"],
      ["999999999999.9999", "999999999999.9999"],
    ])("指数表記を使わない形で保存する: %s → %s", async (input, expected) => {
      expect(await write(input)).toBe(expected);
    });

    test.each([
      "1234567890123",
      "1e12",
      // 丸めると 1000000000000 に繰り上がって整数部が 13 桁になる
      "999999999999.99995",
      "12345678901234567",
      "123456789012345678901234567890",
      "1e21",
      "1e400",
    ])("整数部が 12 桁を超えると有効桁数エラー: %s", async (input) => {
      expect(await write(input)).toEqual(where === "top" ? topDigitsError : subDigitsError);
    });
  });

  test.each([
    [".5", { error: "CB_VA01", key: "record[n].value", message: "数字でなければなりません。" }, "0.5"],
    ["５", { error: "CB_VA01", key: "record[n].value", message: "数字でなければなりません。" }, "5"],
    ["0x10", { error: "CB_VA01", key: "record[n].value", message: "数字でなければなりません。" }, ""],
    ["0b1", { error: "CB_VA01", key: "record[n].value", message: "数字でなければなりません。" }, ""],
  ])("受け付ける書式は top-level と SUBTABLE 内で違う: %s", async (input, top, sub) => {
    expect(await writeTop(client, appId, "n", input)).toEqual(top);
    expect(await writeSub(client, appId, input)).toBe(sub);
  });

  test.each([
    ["１２", "12"],
    ["１.５", "1.5"],
    ["-５", "-5"],
    ["１e３", "1000"],
    ["1２", "12"],
    ["０.０００１５", "0.0002"],
    // 前後に全角スペース (U+3000)。見えないのでエスケープで書く
    ["\u3000５\u3000", "5"],
    // 全角の小数点・符号・e と、U+2212 のマイナスは受け付けない
    ["１．５", ""],
    ["－５", ""],
    ["＋５", ""],
    ["１ｅ３", ""],
    // U+2212 のマイナス「−5」。半角の - と見分けにくいのでエスケープで書く
    ["\u22125", ""],
  ])("SUBTABLE 内は全角数字を数字として読む: %j → %j", async (input, expected) => {
    expect(await writeSub(client, appId, input)).toBe(expected);
    expect(await writeTop(client, appId, "n", input)).toEqual(
      { error: "CB_VA01", key: "record[n].value", message: "数字でなければなりません。" },
    );
  });

  test.each([
    ["r", "１１", { "record[r].value": NAN, "record.r.value": { messages: ["10以下である必要があります。"] } }],
    ["n", "１２３４５６７８９０１２３", {
      "record[n].value": NAN, "record.n.value": { messages: [DIGITS] },
    }],
    // 全角以外の不正な文字があると、範囲・桁数は判定しない
    ["n", "１２３４５６７８９０１２３abc", { "record[n].value": NAN }],
  ] as const)("top-level の全角数字は、数字でないエラーに加えて全角を読んだ値で範囲と桁数も判定する: %s %j", async (field, input, expected) => {
    await expect(client.record.addRecord({ app: appId, record: { [field]: { value: input } } }))
      .rejects.toSatisfy((e: { errors: unknown }) => {
        expect(e.errors).toEqual(expected);
        return true;
      });
  });

  test.each([
    ["10.00004", { error: "CB_VA01", key: "record.r.value", message: "10以下である必要があります。" }],
    ["-5.00004", { error: "CB_VA01", key: "record.r.value", message: "-5以上である必要があります。" }],
    ["1e1", "10"],
    ["10.00000", "10"],
  ])("最大値・最小値は丸める前の値で判定する: %s", async (input, expected) => {
    expect(await writeTop(client, appId, "r", input)).toEqual(expected);
  });

  test("一括追加の有効桁数エラーは records[i] のキーで返る", async () => {
    await expect(client.record.addRecords({
      app: appId, records: [{ n: { value: "1" } }, { n: { value: "1234567890123" } }],
    })).rejects.toMatchObject({ errors: { "records[1].n.value": { messages: [DIGITS] } } });
  });

  test("更新でも丸めと有効桁数エラーが効く", async () => {
    const { id } = await client.record.addRecord({ app: appId, record: { n: { value: "1" } } });
    await expect(client.record.updateRecord({
      app: appId, id, record: { n: { value: "1234567890123" } },
    })).rejects.toMatchObject({ errors: { "record.n.value": { messages: [DIGITS] } } });
    await expect(client.record.updateRecords({
      app: appId, records: [{ id, record: { n: { value: "1234567890123" } } }],
    })).rejects.toMatchObject({ errors: { "records[0].n.value": { messages: [DIGITS] } } });

    await client.record.updateRecord({ app: appId, id, record: { n: { value: "1.23456" } } });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.n!.value).toBe("1.2346");
  });
});

describe.each([
  [{ digits: "5", decimalPlaces: "2", roundingMode: "HALF_EVEN" } as const, {
    "0.005": "0", "0.015": "0.02", "0.025": "0.02", "1.23456": "1.23", "1.99999": "2", "-0.005": "0",
  }],
  [{ digits: "5", decimalPlaces: "2", roundingMode: "UP" } as const, {
    "0.00001": "0.01", "-0.00005": "-0.01", "1.23456": "1.24", "0.025": "0.03", "1.99999": "2",
  }],
  [{ digits: "5", decimalPlaces: "2", roundingMode: "DOWN" } as const, {
    "0.015": "0.01", "1.99999": "1.99", "12.3456789": "12.34", "-0.005": "0",
  }],
])("NUMBER の保存値: 数値精度 %j", (numberPrecision, rounded) => {
  describeDualMode("", () => {
    let client: KintoneRestAPIClient;
    let appId: number;

    beforeAll(async () => {
      ({ client, appId } = await setup(`record-number-precision-${numberPrecision.roundingMode}`, numberPrecision));
    }, 120_000);

    test.each(Object.entries(rounded))("roundingMode で丸める: %s → %s", async (input, expected) => {
      expect(await writeTop(client, appId, "n", input)).toBe(expected);
      expect(await writeSub(client, appId, input)).toBe(expected);
    });

    test.each(["123", "999.99"])("整数部 3 桁までは保存できる: %s", async (input) => {
      expect(await writeTop(client, appId, "n", input)).toBe(input);
    });

    test.each(["1000", "1e3", "12345.678", "99999"])("整数部が 3 桁を超えると有効桁数エラー: %s", async (input) => {
      expect(await writeTop(client, appId, "n", input)).toEqual(topDigitsError);
      expect(await writeSub(client, appId, input)).toEqual(subDigitsError);
    });
  });
});

describeDualMode("NUMBER の保存値: 数値精度 30 桁 / 小数 10 桁", () => {
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(async () => {
    ({ client, appId } = await setup(
      "record-number-precision-30",
      { digits: "30", decimalPlaces: "10", roundingMode: "HALF_EVEN" },
    ));
  }, 120_000);

  test.each([
    // 倍精度浮動小数点では丸まる桁数でもそのまま保存する
    ["12345678901234567", "12345678901234567"],
    ["999999999999.99995", "999999999999.99995"],
    ["1e-7", "0.0000001"],
    ["0.00001", "0.00001"],
  ])("%s → %s", async (input, expected) => {
    expect(await writeTop(client, appId, "n", input)).toBe(expected);
    expect(await writeSub(client, appId, input)).toBe(expected);
  });

  test.each(["123456789012345678901234567890", "1e21"])("整数部が 20 桁を超えると有効桁数エラー: %s", async (input) => {
    expect(await writeTop(client, appId, "n", input)).toEqual(topDigitsError);
  });
});

describeDualMode("NUMBER の保存値: 文字列以外の値", () => {
  let client: KintoneRestAPIClient;
  let appId: number;

  beforeAll(async () => {
    ({ client, appId } = await setup("record-number-precision-json-number"));
  }, 120_000);

  test("JSON の数値で送っても文字列と同じく正規化・丸めする", async () => {
    const { id } = await client.record.addRecord({
      app: appId,
      record: {
        n: { value: 1.23456 as never },
        items: { value: [{ value: { qty: { value: 0.00015 as never } } }] },
      } as never,
    });
    const { record } = await client.record.getRecord({ app: appId, id });
    expect(record.n!.value).toBe("1.2346");
    expect((record.items!.value as unknown as Array<{ value: { qty: { value: string } } }>)[0]!.value.qty.value)
      .toBe("0.0002");
  });
});
