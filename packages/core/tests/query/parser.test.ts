import { describe, expect, test } from "vitest";
import { parseQuery } from "../../src/query";

describe("parseQuery: 基本演算子", () => {
  test("= の単純条件", () => {
    const q = parseQuery('title = "foo"');
    expect(q.where).toEqual({
      type: "cmp",
      field: { type: "field", code: "title" },
      op: "=",
      value: { type: "string", value: "foo" },
    });
    expect(q.orderBy).toEqual([]);
    expect(q.limit).toBeNull();
    expect(q.offset).toBeNull();
  });

  test("数値比較 >= と <=", () => {
    const q = parseQuery('数値_0 >= 10 and 数値_0 <= 20');
    expect(q.where).toMatchObject({
      type: "and",
      left: { type: "cmp", op: ">=", value: { type: "number", value: 10 } },
      right: { type: "cmp", op: "<=", value: { type: "number", value: 20 } },
    });
  });

  test("in リスト", () => {
    const q = parseQuery('drop in ("A", "B", "C")');
    expect(q.where).toEqual({
      type: "in",
      field: { type: "field", code: "drop" },
      negate: false,
      values: [
        { type: "string", value: "A" },
        { type: "string", value: "B" },
        { type: "string", value: "C" },
      ],
    });
  });

  test("not in", () => {
    const q = parseQuery('drop not in ("X")');
    expect(q.where).toMatchObject({ type: "in", negate: true });
  });

  test("like / not like", () => {
    const q1 = parseQuery('text like "keyword"');
    expect(q1.where).toMatchObject({ type: "like", negate: false });
    const q2 = parseQuery('text not like "keyword"');
    expect(q2.where).toMatchObject({ type: "like", negate: true });
  });

  test("is empty / is not empty", () => {
    const q1 = parseQuery("detail is empty");
    expect(q1.where).toEqual({
      type: "is",
      field: { type: "field", code: "detail" },
      negate: false,
      which: "empty",
    });
    const q2 = parseQuery("detail is not empty");
    expect(q2.where).toMatchObject({ type: "is", negate: true });
  });

  test("and / or / グループ化", () => {
    const q = parseQuery('(a = "1" or b = "2") and c = "3"');
    expect(q.where?.type).toBe("and");
  });

  test("$id の参照", () => {
    const q = parseQuery("$id = 5");
    expect(q.where).toMatchObject({
      type: "cmp",
      field: { type: "id" },
    });
  });
});

describe("parseQuery: 日本語・混在フィールドコード", () => {
  test("ひらがな / カタカナ / 漢字", () => {
    const q = parseQuery('顧客名 = "サイボウズ株式会社"');
    expect(q.where).toMatchObject({
      type: "cmp",
      field: { type: "field", code: "顧客名" },
    });
  });

  test("アンダースコア混在", () => {
    const q = parseQuery('文字列__1行_ = "テスト"');
    expect(q.where).toMatchObject({
      type: "cmp",
      field: { type: "field", code: "文字列__1行_" },
    });
  });
});

describe("parseQuery: オプション", () => {
  test("order by 単一", () => {
    const q = parseQuery("order by レコード番号 desc");
    expect(q.where).toBeNull();
    expect(q.orderBy).toEqual([
      { field: { type: "field", code: "レコード番号" }, direction: "desc" },
    ]);
  });

  test("order by 複数 (カンマ区切り)", () => {
    const q = parseQuery("order by a asc, b desc");
    expect(q.orderBy).toEqual([
      { field: { type: "field", code: "a" }, direction: "asc" },
      { field: { type: "field", code: "b" }, direction: "desc" },
    ]);
  });

  test("limit と offset", () => {
    const q = parseQuery('foo = "bar" order by $id asc limit 50 offset 100');
    expect(q.limit).toBe(50);
    expect(q.offset).toBe(100);
  });

  test("order by 省略時は方向 asc デフォルト", () => {
    const q = parseQuery("order by a");
    expect(q.orderBy[0]!.direction).toBe("asc");
  });
});

describe("parseQuery: 関数呼び出し", () => {
  test("TODAY() 引数なし", () => {
    const q = parseQuery("作成日時 = TODAY()");
    expect(q.where).toMatchObject({
      type: "cmp",
      value: { type: "fn", name: "TODAY", args: [] },
    });
  });

  test("NOW() / YESTERDAY() / TOMORROW()", () => {
    const q = parseQuery(
      '日付 > YESTERDAY() and 日付 < TOMORROW() and 作成日時 = NOW()',
    );
    expect(q.where?.type).toBe("and");
  });

  test("LOGINUSER() を in の中で", () => {
    const q = parseQuery("作成者 in (LOGINUSER())");
    expect(q.where).toMatchObject({
      type: "in",
      values: [{ type: "fn", name: "LOGINUSER", args: [] }],
    });
  });
});

describe("parseQuery: エスケープ", () => {
  test('\\" エスケープされたダブルクォート', () => {
    const q = parseQuery('c in ("sample\\"1\\"")');
    expect(q.where).toMatchObject({
      type: "in",
      values: [{ type: "string", value: 'sample"1"' }],
    });
  });

  test("\\\\ エスケープされたバックスラッシュ", () => {
    const q = parseQuery('c in ("sample\\\\2\\\\")');
    expect(q.where).toMatchObject({
      type: "in",
      values: [{ type: "string", value: "sample\\2\\" }],
    });
  });
});

describe("parseQuery: エラー", () => {
  test("不正なトークン", () => {
    expect(() => parseQuery("foo = @")).toThrow();
  });

  test("閉じ括弧忘れ", () => {
    expect(() => parseQuery('foo in ("a", "b"')).toThrow();
  });

  test("値が無い", () => {
    expect(() => parseQuery("foo =")).toThrow();
  });
});
