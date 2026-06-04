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
    expect(c.where).toBe("datetime(body->>'$.published_at.value') <= datetime(?)");
    expect(c.params).toEqual(["2026-01-01T00:00:00Z"]);
  });

  test("DATE 型は date() + BETWEEN（TODAY 等と同様に範囲展開）", () => {
    const c = doCompile('deadline = "2026-04-01"');
    expect(c.where).toBe("date(body->>'$.deadline.value') = date(?)");
    expect(c.params).toEqual(["2026-04-01"]);
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

  test("CHECK_BOX の in は json_each で配列要素を列挙", () => {
    const c = compile(parseQuery('cb in ("opt1", "opt3")'), {
      fieldTypes: { cb: "CHECK_BOX" },
    });
    expect(c.where).toBe(
      "EXISTS (SELECT 1 FROM json_each(body, '$.cb.value') AS elem WHERE elem.value IN (?, ?))",
    );
    expect(c.params).toEqual(["opt1", "opt3"]);
  });

  test("CHECK_BOX の not in は NOT EXISTS（空配列もヒット）", () => {
    const c = compile(parseQuery('cb not in ("opt1")'), {
      fieldTypes: { cb: "CHECK_BOX" },
    });
    expect(c.where).toBe(
      "NOT EXISTS (SELECT 1 FROM json_each(body, '$.cb.value') AS elem WHERE elem.value IN (?))",
    );
    expect(c.params).toEqual(["opt1"]);
  });

  test("USER_SELECT の in は要素の code で比較", () => {
    const c = compile(parseQuery('assignee in ("user1")'), {
      fieldTypes: { assignee: "USER_SELECT" },
    });
    expect(c.where).toBe(
      "EXISTS (SELECT 1 FROM json_each(body, '$.assignee.value') AS elem WHERE elem.value->>'$.code' IN (?))",
    );
    expect(c.params).toEqual(["user1"]);
  });

  test("RADIO_BUTTON / DROP_DOWN の in は単一値比較（配列展開しない）", () => {
    const c = compile(parseQuery('radio in ("a")'), {
      fieldTypes: { radio: "RADIO_BUTTON" },
    });
    expect(c.where).toBe("body->>'$.radio.value' IN (?)");
    expect(c.params).toEqual(["a"]);
  });

  test("CHECK_BOX で選択肢に無い値を in に指定すると GAIA_IQ10", () => {
    expect(() => compile(parseQuery('cb in ("unknown")'), {
      fieldTypes: { cb: "CHECK_BOX" },
      fieldOptions: { cb: new Set(["opt1", "opt2"]) },
    })).toThrow("フィールド「cb」の項目に「unknown」は存在しません。");
  });

  test("CHECK_BOX で選択肢に無い値を not in に指定しても GAIA_IQ10", () => {
    expect(() => compile(parseQuery('cb not in ("unknown")'), {
      fieldTypes: { cb: "CHECK_BOX" },
      fieldOptions: { cb: new Set(["opt1", "opt2"]) },
    })).toThrow("フィールド「cb」の項目に「unknown」は存在しません。");
  });

  test("RADIO_BUTTON で選択肢に無い値は値検証が優先され GAIA_IQ10（= はそもそも許可されない演算子だが IQ03 より IQ10 が先）", () => {
    expect(() => compile(parseQuery('radio = "unknown"'), {
      fieldTypes: { radio: "RADIO_BUTTON" },
      fieldOptions: { radio: new Set(["a", "b"]) },
    })).toThrow("フィールド「radio」の項目に「unknown」は存在しません。");
  });

  test("DROP_DOWN は in (\"\") を許容（未選択レコードの検索）", () => {
    const c = compile(parseQuery('dd in ("")'), {
      fieldTypes: { dd: "DROP_DOWN" },
      fieldOptions: { dd: new Set(["a", "b"]) },
    });
    expect(c.where).toBe("COALESCE(body->>'$.dd.value', '') IN (?)");
    expect(c.params).toEqual([""]);
  });

  test("DROP_DOWN は not in (\"\", ...) で空文字列と他の選択肢を併用できる", () => {
    const c = compile(parseQuery('dd not in ("", "a")'), {
      fieldTypes: { dd: "DROP_DOWN" },
      fieldOptions: { dd: new Set(["a", "b"]) },
    });
    expect(c.where).toBe("COALESCE(body->>'$.dd.value', '') NOT IN (?, ?)");
    expect(c.params).toEqual(["", "a"]);
  });

  test("DROP_DOWN 以外の選択肢フィールドでは空文字列も値検証で弾かれる", () => {
    expect(() => compile(parseQuery('radio in ("")'), {
      fieldTypes: { radio: "RADIO_BUTTON" },
      fieldOptions: { radio: new Set(["a", "b"]) },
    })).toThrow("フィールド「radio」の項目に「」は存在しません。");
  });

  test("fieldOptions 未指定時は検証をスキップ（後方互換）", () => {
    const c = compile(parseQuery('cb in ("whatever")'), {
      fieldTypes: { cb: "CHECK_BOX" },
    });
    expect(c.where).toContain("EXISTS");
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
    expect(c.where).toBe("(body->>'$.detail.value' IS NULL OR trim(body->>'$.detail.value') = '')");
  });

  test("is not empty: 否定形", () => {
    const c = doCompile("detail is not empty");
    expect(c.where).toBe("NOT (body->>'$.detail.value' IS NULL OR trim(body->>'$.detail.value') = '')");
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
    expect(c.where).toBe(
      "EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub " +
        "WHERE sub.value->>'$.value.item_name.value' IN (?))",
    );
    expect(c.params).toEqual(["foo"]);
  });

  test("SUBTABLE 内の not in は「行があり、どの行もマッチしない」形", () => {
    const c = doc('item_name not in ("foo")');
    expect(c.where).toBe(
      "(EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub) AND " +
        "NOT EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub " +
        "WHERE sub.value->>'$.value.item_name.value' IN (?)))",
    );
    expect(c.params).toEqual(["foo"]);
  });

  test("SUBTABLE 内の like", () => {
    const c = doc('item_name like "foo"');
    expect(c.where).toBe(
      "EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub " +
        "WHERE sub.value->>'$.value.item_name.value' LIKE ?)",
    );
    expect(c.params).toEqual(["%foo%"]);
  });

  test("SUBTABLE 内の > 比較も EXISTS で実現（NUMBER は REAL にキャスト）", () => {
    const c = doc('item_qty > 10');
    expect(c.where).toBe(
      "EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub " +
        "WHERE CAST(sub.value->>'$.value.item_qty.value' AS REAL) > ?)",
    );
    expect(c.params).toEqual([10]);
  });

  test("SUBTABLE 内 MULTI_LINE_TEXT の is empty", () => {
    const c = doc('item_memo is empty');
    expect(c.where).toBe(
      "EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub " +
        "WHERE (sub.value->>'$.value.item_memo.value' IS NULL OR " +
        "trim(sub.value->>'$.value.item_memo.value') = ''))",
    );
  });

  test("SUBTABLE 内 MULTI_LINE_TEXT の is not empty は「行があり、どの行も空でない」形", () => {
    const c = doc('item_memo is not empty');
    expect(c.where).toBe(
      "(EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub) AND " +
        "NOT EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub " +
        "WHERE (sub.value->>'$.value.item_memo.value' IS NULL OR " +
        "trim(sub.value->>'$.value.item_memo.value') = '')))",
    );
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
    expect(c.where).toBe(
      "(body->>'$.title.value' = ?) AND " +
      "(EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub " +
        "WHERE sub.value->>'$.value.item_name.value' IN (?)))",
    );
    expect(c.params).toEqual(["top", "foo"]);
  });

  test("同一 SUBTABLE の AND は単一 EXISTS にまとめて同一行制約を表現", () => {
    const c = doc('item_name in ("foo") and item_qty > 10');
    expect(c.where).toBe(
      "EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub WHERE " +
        "(sub.value->>'$.value.item_name.value' IN (?)) AND " +
        "(CAST(sub.value->>'$.value.item_qty.value' AS REAL) > ?))",
    );
    expect(c.params).toEqual(["foo", 10]);
  });

  test("異なる SUBTABLE の AND はマージされず個別 EXISTS", () => {
    const SUBTABLE_FIELDS_2: SubtableFieldMap = {
      a_name: { subtableCode: "tblA", type: "SINGLE_LINE_TEXT" },
      b_name: { subtableCode: "tblB", type: "SINGLE_LINE_TEXT" },
    };
    const c = compile(parseQuery('a_name in ("x") and b_name in ("y")'), {
      fieldTypes: {}, subtableFields: SUBTABLE_FIELDS_2,
    });
    expect(c.where).toBe(
      "(EXISTS (SELECT 1 FROM json_each(body, '$.tblA.value') AS sub WHERE sub.value->>'$.value.a_name.value' IN (?))) AND " +
      "(EXISTS (SELECT 1 FROM json_each(body, '$.tblB.value') AS sub WHERE sub.value->>'$.value.b_name.value' IN (?)))",
    );
    expect(c.params).toEqual(["x", "y"]);
  });

  test("SUBTABLE 内の AND で negative 条件は個別 EXISTS のまま", () => {
    // positive と negative が混在する場合、negative は同一行マージせず独立評価
    const c = doc('item_name in ("foo") and item_memo is not empty');
    expect(c.where).toBe(
      "((EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub) AND " +
        "NOT EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub WHERE " +
        "(sub.value->>'$.value.item_memo.value' IS NULL OR trim(sub.value->>'$.value.item_memo.value') = '')))) AND " +
      "(EXISTS (SELECT 1 FROM json_each(body, '$.items.value') AS sub WHERE sub.value->>'$.value.item_name.value' IN (?)))",
    );
    expect(c.params).toEqual(["foo"]);
  });

  test("SUBTABLE 内を order by に指定するとエラー", () => {
    expect(() => doc('order by item_name asc')).toThrow();
  });
});

describe("compile: 関数の展開", () => {
  test("NOW() は分単位 ISO 8601 UTC", () => {
    const c = doCompile('作成日時 > NOW()');
    expect(c.where).toBe("datetime(created_at) > datetime(?)");
    // NOW は単一値で、分単位の ISO 8601 UTC
    expect(c.params).toEqual(["2026-04-24T02:00:00Z"]);
  });

  test("TODAY() は日付の範囲に展開 / = は BETWEEN", () => {
    const c = doCompile('deadline = TODAY()');
    expect(c.where).toBe("date(body->>'$.deadline.value') BETWEEN date(?) AND date(?)");
    // DATE 型なので YYYY-MM-DD 形式。start = end = 当日
    expect(c.params).toEqual(["2026-04-24", "2026-04-24"]);
  });

  test("TODAY() >= は開始日を使う", () => {
    const c = doCompile('deadline >= TODAY()');
    expect(c.where).toBe("date(body->>'$.deadline.value') >= date(?)");
    expect(c.params).toEqual(["2026-04-24"]);
  });

  test("YESTERDAY() / TOMORROW()", () => {
    const c = doCompile('作成日時 > YESTERDAY() and 作成日時 < TOMORROW()');
    expect(c.where).toBe("(datetime(created_at) > datetime(?)) AND (datetime(created_at) < datetime(?))");
    // `>` は範囲の終端、`<` は範囲の始端を境界に使う（"昨日より後" / "明日より前"）
    expect(c.params).toEqual(["2026-04-23T23:59:59Z", "2026-04-25T00:00:00Z"]);
  });

  test("THIS_YEAR() で年の範囲（DATETIME 比較は秒単位）", () => {
    const c = doCompile('作成日時 = THIS_YEAR()');
    expect(c.where).toBe("datetime(created_at) BETWEEN datetime(?) AND datetime(?)");
    expect(c.params).toEqual(["2026-01-01T00:00:00Z", "2026-12-31T23:59:59Z"]);
  });
});
