// kintone クエリ関数を実行時に具体値 or 日時範囲に展開する。
// 仕様: tmp/kintone-query.md

import type { FnArg, Value } from "./ast";

export type ExpandContext = {
  /** 現在日時（テストでは固定値を注入可能） */
  now?: Date;
  /** LOGINUSER() の展開値（username / code） */
  loginUser?: string;
  /** PRIMARY_ORGANIZATION() の展開値 */
  primaryOrganization?: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export const toIsoDateTime = (d: Date): string => {
  const copy = new Date(d);
  copy.setUTCSeconds(0, 0);
  return copy.toISOString().replace(/\.\d{3}Z$/, "Z");
};

export const toLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 関数呼び出しの展開結果。単値 or 範囲。 */
export type FnResult =
  | { kind: "value"; value: string | number }
  | { kind: "range"; start: string; end: string };

const WEEKDAY_MAP: Record<string, number> = {
  SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
  THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
};

const addDays = (d: Date, n: number): Date => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

const addMonths = (d: Date, n: number): Date => {
  const c = new Date(d);
  c.setMonth(c.getMonth() + n);
  return c;
};

const addYears = (d: Date, n: number): Date => {
  const c = new Date(d);
  c.setFullYear(c.getFullYear() + n);
  return c;
};

const addWeeks = (d: Date, n: number): Date => addDays(d, n * 7);

const dayRange = (d: Date): FnResult => {
  const ymd = toLocalDate(d);
  return { kind: "range", start: `${ymd}T00:00:00Z`, end: `${ymd}T23:59:59Z` };
};

const yearRange = (d: Date): FnResult => {
  const y = d.getFullYear();
  return { kind: "range", start: `${y}-01-01T00:00:00Z`, end: `${y}-12-31T23:59:59Z` };
};

/** 月の範囲。day を指定すれば月内の特定日、未指定なら月全体。 */
const monthRange = (d: Date): FnResult => {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0); // 月末
  return {
    kind: "range",
    start: `${toLocalDate(start)}T00:00:00Z`,
    end: `${toLocalDate(end)}T23:59:59Z`,
  };
};

/** 週の範囲。起点は日曜。曜日指定がある場合はその日を単日範囲で返す。 */
const weekRange = (d: Date, weekday?: number): FnResult => {
  const sunday = addDays(d, -d.getDay());
  if (weekday === undefined) {
    const saturday = addDays(sunday, 6);
    return {
      kind: "range",
      start: `${toLocalDate(sunday)}T00:00:00Z`,
      end: `${toLocalDate(saturday)}T23:59:59Z`,
    };
  }
  return dayRange(addDays(sunday, weekday));
};

/** THIS_MONTH / LAST_MONTH / NEXT_MONTH の共通処理 */
const monthOrDay = (base: Date, arg: FnArg | undefined): FnResult => {
  if (arg === undefined) return monthRange(base);
  if (arg.type === "symbol" && arg.value.toUpperCase() === "LAST") {
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return dayRange(last);
  }
  if (arg.type === "number") {
    // 1〜31。存在しない日は kintone では「翌月1日」扱い
    const y = base.getFullYear();
    const m = base.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    if (arg.value >= 1 && arg.value <= lastDay) {
      return dayRange(new Date(y, m, arg.value));
    }
    // はみ出しは翌月 1 日
    return dayRange(new Date(y, m + 1, 1));
  }
  throw new Error(`invalid argument for month function: ${JSON.stringify(arg)}`);
};

/** FROM_TODAY(number, unit) */
const fromToday = (now: Date, args: FnArg[]): FnResult => {
  if (args.length !== 2) throw new Error("FROM_TODAY expects 2 arguments");
  const [numArg, unitArg] = args;
  if (numArg!.type !== "number") throw new Error("FROM_TODAY: 1st arg must be number");
  if (unitArg!.type !== "symbol") throw new Error("FROM_TODAY: 2nd arg must be a unit symbol");
  const n = numArg!.value;
  const unit = unitArg!.value.toUpperCase();
  let target: Date;
  switch (unit) {
    case "DAYS":   target = addDays(now, n); break;
    case "WEEKS":  target = addWeeks(now, n); break;
    case "MONTHS": target = addMonths(now, n); break;
    case "YEARS":  target = addYears(now, n); break;
    default: throw new Error(`FROM_TODAY: unknown unit ${unit}`);
  }
  return dayRange(target);
};

/**
 * 関数を評価する。
 */
export const evalFunction = (
  name: string,
  args: FnArg[],
  ctx: ExpandContext = {},
): FnResult => {
  const now = ctx.now ?? new Date();
  const upper = name.toUpperCase();

  switch (upper) {
    case "NOW":          return { kind: "value", value: toIsoDateTime(now) };
    case "TODAY":        return dayRange(now);
    case "YESTERDAY":    return dayRange(addDays(now, -1));
    case "TOMORROW":     return dayRange(addDays(now, 1));
    case "THIS_YEAR":    return yearRange(now);
    case "LAST_YEAR":    return yearRange(addYears(now, -1));
    case "NEXT_YEAR":    return yearRange(addYears(now, 1));
    case "THIS_MONTH":   return monthOrDay(now, args[0]);
    case "LAST_MONTH":   return monthOrDay(addMonths(now, -1), args[0]);
    case "NEXT_MONTH":   return monthOrDay(addMonths(now, 1), args[0]);
    case "THIS_WEEK":    return weekRange(now, resolveWeekday(args[0]));
    case "LAST_WEEK":    return weekRange(addWeeks(now, -1), resolveWeekday(args[0]));
    case "NEXT_WEEK":    return weekRange(addWeeks(now, 1), resolveWeekday(args[0]));
    case "FROM_TODAY":   return fromToday(now, args);
    case "LOGINUSER":
      if (!ctx.loginUser) throw new Error("LOGINUSER() requires ExpandContext.loginUser");
      return { kind: "value", value: ctx.loginUser };
    case "PRIMARY_ORGANIZATION":
      if (!ctx.primaryOrganization) throw new Error("PRIMARY_ORGANIZATION() requires ExpandContext.primaryOrganization");
      return { kind: "value", value: ctx.primaryOrganization };
    default:
      throw new Error(`unsupported function: ${name}`);
  }
};

const resolveWeekday = (arg: FnArg | undefined): number | undefined => {
  if (arg === undefined) return undefined;
  if (arg.type !== "symbol") throw new Error("weekday argument must be a symbol");
  const key = arg.value.toUpperCase();
  const n = WEEKDAY_MAP[key];
  if (n === undefined) throw new Error(`unknown weekday: ${arg.value}`);
  return n;
};

/** 単値の関数結果を Value に畳み込む（in の中などで使う） */
export const valueFromFnResult = (r: FnResult): Value => {
  if (r.kind === "value") {
    return typeof r.value === "number"
      ? { type: "number", value: r.value }
      : { type: "string", value: r.value };
  }
  return { type: "string", value: r.start };
};
