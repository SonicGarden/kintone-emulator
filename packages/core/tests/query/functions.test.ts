import { describe, expect, test } from "vitest";
import { compile, parseQuery } from "../../src/query";
import type { FieldTypeMap } from "../../src/query";

const FIELD_TYPES: FieldTypeMap = {
  deadline: "DATE",
  created: "CREATED_TIME",
  作成者: "CREATOR",
  組織: "ORGANIZATION_SELECT",
};

// Saturday
const NOW = new Date("2026-04-25T10:00:00Z");

const doCompile = (q: string, extra: Partial<{ loginUser: string; primaryOrganization: string }> = {}) =>
  compile(parseQuery(q), { fieldTypes: FIELD_TYPES, expandCtx: { now: NOW, ...extra } });

describe("functions: 引数付き", () => {
  test("FROM_TODAY(5, DAYS) で 5 日後", () => {
    const c = doCompile('deadline = FROM_TODAY(5, DAYS)');
    expect(c.params[0]).toBe("2026-04-30");
    expect(c.params[1]).toBe("2026-04-30");
  });

  test("FROM_TODAY(-3, DAYS) で 3 日前", () => {
    const c = doCompile('deadline = FROM_TODAY(-3, DAYS)');
    expect(c.params[0]).toBe("2026-04-22");
  });

  test("FROM_TODAY(2, MONTHS) で 2 ヶ月後の日", () => {
    const c = doCompile('deadline = FROM_TODAY(2, MONTHS)');
    expect(c.params[0]).toBe("2026-06-25");
  });

  test("FROM_TODAY(1, YEARS)", () => {
    const c = doCompile('deadline = FROM_TODAY(1, YEARS)');
    expect(c.params[0]).toBe("2027-04-25");
  });

  test("THIS_WEEK() で今週の日-土 (NOW=土曜)", () => {
    const c = doCompile('deadline = THIS_WEEK()');
    expect(c.params[0]).toBe("2026-04-19"); // 日曜
    expect(c.params[1]).toBe("2026-04-25"); // 土曜
  });

  test("THIS_WEEK(MONDAY) で今週月曜", () => {
    const c = doCompile('deadline = THIS_WEEK(MONDAY)');
    expect(c.params[0]).toBe("2026-04-20");
    expect(c.params[1]).toBe("2026-04-20");
  });

  test("LAST_WEEK() で先週", () => {
    const c = doCompile('deadline = LAST_WEEK()');
    expect(c.params[0]).toBe("2026-04-12");
    expect(c.params[1]).toBe("2026-04-18");
  });

  test("THIS_MONTH() で今月", () => {
    const c = doCompile('deadline = THIS_MONTH()');
    expect(c.params[0]).toBe("2026-04-01");
    expect(c.params[1]).toBe("2026-04-30");
  });

  test("THIS_MONTH(15) で今月 15 日", () => {
    const c = doCompile('deadline = THIS_MONTH(15)');
    expect(c.params[0]).toBe("2026-04-15");
    expect(c.params[1]).toBe("2026-04-15");
  });

  test("THIS_MONTH(LAST) で月末", () => {
    const c = doCompile('deadline = THIS_MONTH(LAST)');
    expect(c.params[0]).toBe("2026-04-30");
    expect(c.params[1]).toBe("2026-04-30");
  });

  test("LAST_MONTH() / NEXT_MONTH()", () => {
    const last = doCompile('deadline = LAST_MONTH()');
    expect(last.params[0]).toBe("2026-03-01");
    const next = doCompile('deadline = NEXT_MONTH()');
    expect(next.params[0]).toBe("2026-05-01");
  });
});

describe("functions: LOGINUSER / PRIMARY_ORGANIZATION", () => {
  test("LOGINUSER() は loginUser で展開", () => {
    const c = doCompile("作成者 in (LOGINUSER())", { loginUser: "alice" });
    expect(c.params).toEqual(["alice"]);
  });

  test("LOGINUSER() がコンテキスト未指定ならエラー", () => {
    expect(() => doCompile("作成者 in (LOGINUSER())")).toThrow(/LOGINUSER/);
  });

  test("PRIMARY_ORGANIZATION()", () => {
    const c = doCompile("組織 in (PRIMARY_ORGANIZATION())", { primaryOrganization: "sales" });
    expect(c.params).toEqual(["sales"]);
  });
});
