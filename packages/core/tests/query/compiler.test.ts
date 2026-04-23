import { describe, expect, test } from "vitest";
import { compile, parseQuery } from "../../src/query";
import type { FieldTypeMap } from "../../src/query";

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

  test("数値 >= と <= の AND", () => {
    const c = doCompile("num >= 10 and num <= 20");
    expect(c.where).toBe("(body->>'$.num.value' >= ?) AND (body->>'$.num.value' <= ?)");
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
