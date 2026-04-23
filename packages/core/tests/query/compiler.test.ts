import { describe, expect, test } from "vitest";
import { compile, parseQuery } from "../../src/query";
import type { FieldTypeMap, SubtableFieldMap } from "../../src/query";

const FIELD_TYPES: FieldTypeMap = {
  title: "SINGLE_LINE_TEXT",
  num: "NUMBER",
  detail: "MULTI_LINE_TEXT",
  レコード番号: "RECORD_NUMBER",
  作成日時: "CREATED_TIME",
  更新日時: "UPDATED_TIME",
  deadline: "DATE",
  published_at: "DATETIME",
};

const NOW = new Date("2026-04-24T02:00:00Z");

const doCompile = (q: string) => {
  const ast = parseQuery(q);
  return compile(ast, { fieldTypes: FIELD_TYPES, expandCtx: { now: NOW } });
};

describe("compile: 基本", () => {
  test("= 文字列", () => {
    const c = doCompile('title = "foo"');
    expect(c.where).toBe("body->>'$.title.value' = ?");
    expect(c.params).toEqual(["foo"]);
  });

  test("数値 >= と <= の AND（NUMBER は REAL にキャストして比較）", () => {
    const c = doCompile("num >= 10 and num <= 20");
    expect(c.where).toBe(
      "(CAST(body->>'$.num.value' AS REAL) >= ?) AND (CAST(body->>'$.num.value' AS REAL) <= ?)",
    );
    expect(c.params).toEqual([10, 20]);
  });

  test("レコード番号フィールドは id カラムに", () => {
    const c = doCompile('レコード番号 = 5');
    expect(c.where).toBe("id = ?");
    expect(c.params).toEqual([5]);
  });

  test("$id も id カラムに", () => {
    const c = doCompile("$id > 100");
    expect(c.where).toBe("id > ?");
    expect(c.params).toEqual([100]);
  });

  test("作成日時 / 更新日時 は datetime(created_at|updated_at) に", () => {
    const c = doCompile('作成日時 > "2026-01-01T00:00:00Z"');
    expect(c.where).toBe("datetime(created_at) > datetime(?)");
    expect(c.params).toEqual(["2026-01-01T00:00:00Z"]);
  });

  test("DATETIME 型は body JSON + datetime()", () => {
    const c = doCompile('published_at <= "2026-01-01T00:00:00Z"');
    expect(c.where).toContain(`datetime(body->>'$.published_at.value')`);
    expect(c.where).toContain("<= datetime(?)");
  });

  test("DATE 型は date()", () => {
    const c = doCompile('deadline = "2026-04-01"');
    expect(c.where).toContain(`date(body->>'$.deadline.value')`);
  });
});

describe("compile: in / not in", () => {
  test("in 複数値", () => {
    const c = doCompile('title in ("a", "b", "c")');
    expect(c.where).toBe("body->>'$.title.value' IN (?, ?, ?)");
    expect(c.params).toEqual(["a", "b", "c"]);
  });

  test("not in", () => {
    const c = doCompile('title not in ("x")');
    expect(c.where).toBe("body->>'$.title.value' NOT IN (?)");
    expect(c.params).toEqual(["x"]);
  });
});

describe("compile: like", () => {
  test("like は %? を SQL LIKE の両端 % に変換", () => {
    const c = doCompile('title like "foo"');
    expect(c.where).toBe("body->>'$.title.value' LIKE ?");
    expect(c.params).toEqual(["%foo%"]);
  });

  test("not like", () => {
    const c = doCompile('title not like "foo"');
    expect(c.where).toBe("body->>'$.title.value' NOT LIKE ?");
    expect(c.params).toEqual(["%foo%"]);
  });
});

describe("compile: is empty", () => {
  test("is empty: NULL または trim 後の空文字を判定", () => {
    const c = doCompile("detail is empty");
    expect(c.where).toContain("IS NULL");
    expect(c.where).toContain("trim(");
  });

  test("is not empty: 否定形", () => {
    const c = doCompile("detail is not empty");
    expect(c.where?.startsWith("NOT ")).toBe(true);
  });
});

describe("compile: order by / limit / offset", () => {
  test("order by 省略時は $id desc がデフォルト", () => {
    const c = doCompile("");
    expect(c.where).toBeNull();
    expect(c.orderBy).toBe("id DESC");
  });

  test("order by レコード番号 desc", () => {
    const c = doCompile("order by レコード番号 desc");
    expect(c.where).toBeNull();
    expect(c.orderBy).toBe("id DESC");
  });

  test("order by 複数 + limit + offset", () => {
    const c = doCompile(
      'title = "x" order by $id asc, 更新日時 desc limit 50 offset 100',
    );
    expect(c.where).toBe("body->>'$.title.value' = ?");
    expect(c.orderBy).toBe("id ASC, datetime(updated_at) DESC");
    expect(c.limit).toBe(50);
    expect(c.offset).toBe(100);
  });
});

describe("compile: SUBTABLE 内フィールド", () => {
  const SUBTABLE_FIELDS: SubtableFieldMap = {
    item_name: { subtableCode: "items", type: "SINGLE_LINE_TEXT" },
    item_qty:  { subtableCode: "items", type: "NUMBER" },
    item_date: { subtableCode: "items", type: "DATE" },
    item_memo: { subtableCode: "items", type: "MULTI_LINE_TEXT" },
  };
  const FTYPES: FieldTypeMap = { title: "SINGLE_LINE_TEXT" };

  const doc = (q: string) => compile(parseQuery(q), { fieldTypes: FTYPES, subtableFields: SUBTABLE_FIELDS });

  test("SUBTABLE 内の in は EXISTS (json_each(...))", () => {
    const c = doc('item_name in ("foo")');
    expect(c.where).toContain("EXISTS");
    expect(c.where).toContain("json_each(body, '$.items.value')");
    expect(c.where).toContain("sub.value->>'$.value.item_name.value'");
    expect(c.where).toContain("IN (?)");
    expect(c.params).toEqual(["foo"]);
  });

  test("SUBTABLE 内の not in は NOT EXISTS でラップ", () => {
    const c = doc('item_name not in ("foo")');
    expect(c.where!.startsWith("NOT EXISTS") || c.where!.includes("NOT EXISTS")).toBe(true);
    // 内側は positive （IN）
    expect(c.where).toContain("IN (?)");
  });

  test("SUBTABLE 内の like", () => {
    const c = doc('item_name like "foo"');
    expect(c.where).toContain("EXISTS");
    expect(c.where).toContain("LIKE ?");
    expect(c.params).toEqual(["%foo%"]);
  });

  test("SUBTABLE 内の > 比較も EXISTS で実現", () => {
    const c = doc('item_qty > 10');
    expect(c.where).toContain("EXISTS");
    expect(c.where).toContain("> ?");
    expect(c.params).toEqual([10]);
  });

  test("SUBTABLE 内 MULTI_LINE_TEXT の is empty / is not empty", () => {
    const c1 = doc('item_memo is empty');
    expect(c1.where).toContain("EXISTS");
    expect(c1.where).toContain("IS NULL");
    const c2 = doc('item_memo is not empty');
    // negative は「行がある AND どの行も空でない」という形
    expect(c2.where).toContain("AND NOT EXISTS");
  });

  test("SUBTABLE 内 DATE に =・!= は GAIA_IQ07", () => {
    expect(() => doc('item_date = "2026-01-01"')).toThrow(/テーブル.*item_date.*=/);
    expect(() => doc('item_date != "2026-01-01"')).toThrow(/テーブル.*item_date.*!=/);
  });

  test("SUBTABLE 内 SINGLE_LINE_TEXT に =・!= は GAIA_IQ07", () => {
    expect(() => doc('item_name = "x"')).toThrow(/テーブル/);
  });

  test("SUBTABLE と top-level の混合は AND で結合", () => {
    const c = doc('title = "top" and item_name in ("foo")');
    expect(c.where).toContain("body->>'$.title.value' = ?");
    expect(c.where).toContain("EXISTS");
  });

  test("SUBTABLE 内を order by に指定するとエラー", () => {
    expect(() => doc('order by item_name asc')).toThrow();
  });
});

describe("compile: 関数の展開", () => {
  test("NOW() は分単位 ISO 8601 UTC", () => {
    const c = doCompile('作成日時 > NOW()');
    expect(c.params[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
  });

  test("TODAY() は日付の範囲に展開 / = は BETWEEN", () => {
    const c = doCompile('deadline = TODAY()');
    expect(c.where).toMatch(/BETWEEN/);
    expect(c.params).toHaveLength(2);
    // DATE 型なので YYYY-MM-DD 形式
    expect(c.params[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.params[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("TODAY() >= は開始日を使う", () => {
    const c = doCompile('deadline >= TODAY()');
    expect(c.where).toMatch(/>= date\(\?\)/);
  });

  test("YESTERDAY() / TOMORROW()", () => {
    const c = doCompile('作成日時 > YESTERDAY() and 作成日時 < TOMORROW()');
    expect(c.params).toHaveLength(2);
  });

  test("THIS_YEAR() で年の範囲", () => {
    const c = doCompile('作成日時 = THIS_YEAR()');
    expect(c.where).toMatch(/BETWEEN/);
  });
});
