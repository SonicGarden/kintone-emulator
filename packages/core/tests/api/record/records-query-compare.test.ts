import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { beforeAll, describe, expect, test } from "vitest";
import { createTestApp, describeDualMode, getTestClient, resetTestEnvironment } from "../../real-kintone";

// 比較演算子の型別ルール (doc/kintone-query-behavior.md「数値の比較」「文字列の比較」)。
// 1 つのアプリに全レコードを入れ、クエリ → ヒットしたレコードの label (レコード番号順) を検証する。
// 実 kintone でのアプリ準備が遅いので、beforeEach ではなく beforeAll で 1 度だけ作る

const LONG = "x".repeat(64);

/** 半角数字を全角数字 (U+FF10〜FF19) にする */
const fullWidth = (s: string) => s.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

describeDualMode("クエリの比較: 型別ルール", () => {
  const SESSION = "records-query-compare";
  let client: KintoneRestAPIClient;
  let appId: number;
  let recordIds: string[];

  const labels = async (query: string): Promise<string[]> => {
    const { records } = await client.record.getRecords({ app: appId, query: `${query} order by $id asc` });
    return records.map((r) => r.label!.value as string);
  };

  beforeAll(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "query compare",
      properties: {
        label: { type: "SINGLE_LINE_TEXT", code: "label", label: "label" },
        n: { type: "NUMBER", code: "n", label: "n" },
        t: { type: "SINGLE_LINE_TEXT", code: "t", label: "t" },
        lk: { type: "LINK", code: "lk", label: "lk", protocol: "WEB" },
        items: {
          type: "SUBTABLE", code: "items", label: "items",
          fields: {
            qty: { type: "NUMBER", code: "qty", label: "qty" },
            name: { type: "SINGLE_LINE_TEXT", code: "name", label: "name" },
          },
        },
      },
      records: [
        { label: { value: "5" }, n: { value: "5" }, t: { value: "abc" }, lk: { value: "https://a.jp/abc" },
          items: { value: [{ value: { qty: { value: "5" }, name: { value: "abc" } } }] } },
        { label: { value: "empty" }, n: { value: "" }, t: { value: "abc " }, lk: { value: "https://a.jp/abc " },
          items: { value: [{ value: { qty: { value: "" }, name: { value: "abc " } } }] } },
        { label: { value: "-1" }, n: { value: "-1" }, t: { value: " abc" } },
        // t は末尾に全角スペース (U+3000)
        { label: { value: "0" }, n: { value: "0" }, t: { value: "abc\u3000" } },
        { label: { value: "0.5" }, n: { value: "0.5" }, t: { value: "abc\t" } },
        { label: { value: "big" }, n: { value: "999999999999.9999" }, t: { value: `${LONG}A` } },
        { label: { value: "big2" }, n: { value: "999999999999.9998" }, t: { value: `${LONG}B` } },
        // n / lk を送らないレコード。未入力として扱われる
        { label: { value: "unset" }, t: { value: "abc  " } },
      ],
    }));
    const all = await client.record.getRecords({ app: appId, query: "order by $id asc" });
    recordIds = all.records.map((r) => r.$id!.value as string);
  }, 120_000);

  describe("NUMBER", () => {
    test.each([
      // クエリ値は書き込み時と同じく正規化される
      ['n = "05"', ["5"]],
      ['n = "+5"', ["5"]],
      ['n = "5e0"', ["5"]],
      ['n = "5E0"', ["5"]],
      ['n = "5.0"', ["5"]],
      ['n = "0.5e1"', ["5"]],
      ['n = "-0"', ["0"]],
      ["n = 5", ["5"]],
      // 書き込み時は 400 になる `.5` もクエリでは受け付ける
      ['n = ".5"', ["0.5"]],
      // 倍精度浮動小数点では区別しにくい桁でも正しく比較する
      ['n > "999999999999.9998"', ["big"]],
      ['n = "999999999999.99990"', ["big"]],
    ])("%s は正規化後の値で比較する", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });

    test.each([
      // 書き込み時はトリムされる前後空白が、クエリでは解釈できない値になる
      ['n = " 5"', []],
      ['n = "5 "', []],
      ['n = "1,234"', []],
      ['n = "5abc"', []],
      // `!=` / 大小比較も 0 件になる (NOT(=) ではない)
      ['n != "abc"', []],
      ['n != "5 "', []],
      ['n < "abc"', []],
      ['n > "abc"', []],
      ['n in ("abc")', []],
      // in は解釈できない要素を無視するだけなので、not in は全件に一致する
      ['n not in ("abc")', ["5", "empty", "-1", "0", "0.5", "big", "big2", "unset"]],
    ])("数値として解釈できないクエリ値: %s", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });

    test.each([
      ['n = ""', ["empty", "unset"]],
      ['n = "0"', ["0"]],
      ['n != "0"', ["5", "empty", "-1", "0.5", "big", "big2", "unset"]],
      ['n != ""', ["5", "-1", "0", "0.5", "big", "big2"]],
      ['n in ("05", "")', ["5", "empty", "unset"]],
      ['n not in ("0")', ["5", "empty", "-1", "0.5", "big", "big2", "unset"]],
      ['n not in ("")', ["5", "-1", "0", "0.5", "big", "big2"]],
      // 大小比較では -∞ 扱い
      ["n < -1000000", ["empty", "unset"]],
      ["n <= -1000000", ["empty", "unset"]],
      ["n > -1000000", ["5", "-1", "0", "0.5", "big", "big2"]],
      ["n >= -1000000", ["5", "-1", "0", "0.5", "big", "big2"]],
      ["n < 0", ["empty", "-1", "unset"]],
      ["n >= 0", ["5", "0", "0.5", "big", "big2"]],
    ])("未入力は 0 と別の値として扱う: %s", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });

    test.each([
      ['n = "５"', ["5"]],
      ['n = "０.５"', ["0.5"]],
      // 符号・小数点・指数は半角なら全角数字と組み合わせられる
      ['n = "-１"', ["-1"]],
      ['n = "５e０"', ["5"]],
      ['n in ("５", "abc")', ["5"]],
      ['qty in ("５")', ["5"]],
    ])("全角数字は半角と同じく数値として読む: %s", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });

    test.each([
      'n != "－１"',
      'n != "＋５"',
      'n != "０．５"',
      'n != "５ｅ０"',
      // 先頭に全角スペース (U+3000)
      'n != "\u3000５"',
    ])("全角の符号・小数点・e・空白は解釈できない値になる: %s", async (query) => {
      expect(await labels(query)).toEqual([]);
    });

    test.each(['n > ""', 'n < ""', 'n >= ""', 'n <= ""'])("空文字との大小比較 %s は GAIA_IL08", async (query) => {
      await expect(labels(query)).rejects.toMatchObject({ code: "GAIA_IL08" });
    });

    test.each([
      ["qty < -1000000", ["empty"]],
      ["qty > -1000000", ["5"]],
      ['qty in ("")', ["empty"]],
      ['qty in ("05")', ["5"]],
      ['qty not in ("0")', ["5", "empty"]],
      ['qty not in ("")', ["5"]],
    ])("テーブル内の NUMBER も同じルール: %s", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });
  });

  describe("RECORD_NUMBER / $id", () => {
    const id = () => recordIds[1]!;

    test.each([
      [(i: string) => `レコード番号 = "0${i}"`],
      [(i: string) => `レコード番号 = "+${i}"`],
      [(i: string) => `レコード番号 in ("0${i}")`],
      [(i: string) => `$id = "0${i}"`],
    ])("先頭ゼロと符号は正規化する: %s", async (q) => {
      expect(await labels(q(id()))).toEqual(["empty"]);
    });

    test.each([
      [(i: string) => `レコード番号 = "${fullWidth(i)}"`],
      [(i: string) => `$id = "+${fullWidth(i)}"`],
    ])("全角数字も数値として読む: %s", async (q) => {
      expect(await labels(q(id()))).toEqual(["empty"]);
    });

    test("not in も正規化した値で除外する", async () => {
      expect(await labels(`レコード番号 not in ("0${id()}")`)).toEqual(
        ["5", "-1", "0", "0.5", "big", "big2", "unset"],
      );
    });

    test("大小比較も正規化した値で比較する", async () => {
      expect(await labels(`レコード番号 > "0${id()}"`)).toEqual(["-1", "0", "0.5", "big", "big2", "unset"]);
    });

    test.each([
      [(i: string) => `レコード番号 = "${i}e0"`],
      [(i: string) => `レコード番号 = "${i}.0"`],
      [(i: string) => `レコード番号 = " ${i}"`],
      [(i: string) => `レコード番号 > "${i}e0"`],
      [(i: string) => `$id = "${i}e0"`],
      [() => 'レコード番号 != "abc"'],
    ])("NUMBER と違い指数表記・小数表記は解釈できず 0 件: %s", async (q) => {
      expect(await labels(q(id()))).toEqual([]);
    });

    test("空文字は = で 0 件、!= で全件", async () => {
      expect(await labels('レコード番号 = ""')).toEqual([]);
      expect(await labels('レコード番号 != ""')).toHaveLength(8);
    });

    test("空文字との大小比較は GAIA_IL08", async () => {
      await expect(labels('レコード番号 > ""')).rejects.toMatchObject({ code: "GAIA_IL08" });
    });
  });

  describe("SINGLE_LINE_TEXT / LINK", () => {
    test.each([
      // 末尾の半角スペースはレコード値・クエリ値の両方で無視する
      ['t = "abc"', ["5", "empty", "unset"]],
      ['t = "abc "', ["5", "empty", "unset"]],
      ['t in ("abc")', ["5", "empty", "unset"]],
      ['t != "abc"', ["-1", "0", "0.5", "big", "big2"]],
      ['t not in ("abc")', ["-1", "0", "0.5", "big", "big2"]],
      // 先頭の空白・全角スペース・タブは区別する
      ['t = " abc"', ["-1"]],
      // 末尾に全角スペース (U+3000)
      ['t = "abc\u3000"', ["0"]],
    ])("末尾の半角スペース: %s", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });

    test.each([
      [`t = "${LONG}"`, ["big", "big2"]],
      [`t = "${LONG}C"`, ["big", "big2"]],
      [`t in ("${LONG}Z")`, ["big", "big2"]],
      [`t != "${LONG}C"`, ["5", "empty", "-1", "0", "0.5", "unset"]],
      [`t not in ("${LONG}Z")`, ["5", "empty", "-1", "0", "0.5", "unset"]],
      // 64 文字目が違えば一致しない
      [`t = "${LONG.slice(1)}A"`, []],
    ])("先頭 64 文字で比較する: %s", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });

    test.each([
      ['lk = "https://a.jp/abc"', ["5", "empty"]],
      ['lk = "https://a.jp/abc  "', ["5", "empty"]],
      ['lk != "https://a.jp/abc"', ["-1", "0", "0.5", "big", "big2", "unset"]],
      // 値を送らなかったレコードは空文字として比較する
      ['lk = ""', ["-1", "0", "0.5", "big", "big2", "unset"]],
    ])("LINK も同じルール: %s", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });

    test.each([
      ['name in ("abc")', ["5", "empty"]],
      ['name in ("abc ")', ["5", "empty"]],
      ['name not in ("abc")', []],
    ])("テーブル内の SINGLE_LINE_TEXT も同じルール: %s", async (query, expected) => {
      expect(await labels(query)).toEqual(expected);
    });
  });
});
