// Phase 4: 文字列対応評価器。`&` 結合 / DATE_FORMAT / YEN / IF の文字列分岐に対応。
// 戻り値型は number | string。SUM 用に SUBTABLE 内 NUMBER は number[] として保持する。

import type { CalcNode } from "./ast";

export type CalcValue = string | number | number[] | string[];
export type CalcValues = Record<string, CalcValue | undefined>;
export type CalcResult = number | string;

export class CalcEvalError extends Error {
  constructor(
    message: string,
    public readonly kind: "unsupported" | "divide_by_zero" | "overflow" | "type_mismatch",
  ) {
    super(message);
  }
}

export const evaluate = (node: CalcNode, values: CalcValues): CalcResult => {
  switch (node.type) {
    case "number": return node.value;
    case "string": return node.value;
    case "bool":   return node.value ? 1 : 0;
    case "field":  return scalarToValue(values[node.code]);
    case "unary": {
      const v = asNumber(evaluate(node.expr, values));
      return node.op === "-" ? -v : v;
    }
    case "binary": return evaluateBinary(node.op, node.left, node.right, values);
    case "call":   return evaluateCall(node.name.toUpperCase(), node.args, values);
    default:
      throw new CalcEvalError(`unsupported node ${(node as CalcNode).type}`, "unsupported");
  }
};

/** 数値専用の評価（Phase 2/3 互換 API）。文字列が返ってきたら type_mismatch として例外。*/
export const evaluateNumeric = (node: CalcNode, values: CalcValues): number => {
  const r = evaluate(node, values);
  if (typeof r === "string") throw new CalcEvalError("expected number, got string", "type_mismatch");
  return r;
};

const evaluateBinary = (
  op: string,
  left: CalcNode,
  right: CalcNode,
  values: CalcValues,
): CalcResult => {
  if (op === "&") return asString(evaluate(left, values)) + asString(evaluate(right, values));

  const l = asNumber(evaluate(left, values));
  const r = asNumber(evaluate(right, values));
  switch (op) {
    case "+": return l + r;
    case "-": return l - r;
    case "*": return l * r;
    case "/":
      if (r === 0) throw new CalcEvalError("divide by zero", "divide_by_zero");
      return l / r;
    case "^": {
      const exp = Math.trunc(r);
      if (exp > 100 || exp < -100) throw new CalcEvalError("exponent out of range", "overflow");
      return Math.pow(l, exp);
    }
    case "=":  return l === r ? 1 : 0;
    case "!=": return l !== r ? 1 : 0;
    case "<":  return l <  r ? 1 : 0;
    case "<=": return l <= r ? 1 : 0;
    case ">":  return l >  r ? 1 : 0;
    case ">=": return l >= r ? 1 : 0;
    default:
      throw new CalcEvalError(`unsupported operator ${op}`, "unsupported");
  }
};

const evaluateCall = (name: string, args: CalcNode[], values: CalcValues): CalcResult => {
  switch (name) {
    case "SUM":         return evaluateSum(args, values);
    case "IF":          return evaluate(args[asNumber(evaluate(args[0]!, values)) !== 0 ? 1 : 2]!, values);
    case "AND":         return args.every((a) => asNumber(evaluate(a, values)) !== 0) ? 1 : 0;
    case "OR":          return args.some((a)  => asNumber(evaluate(a, values)) !== 0) ? 1 : 0;
    case "NOT":         return asNumber(evaluate(args[0]!, values)) === 0 ? 1 : 0;
    case "ROUND":       return roundWith(args, values, "half-up");
    case "ROUNDUP":     return roundWith(args, values, "up");
    case "ROUNDDOWN":   return roundWith(args, values, "down");
    case "YEN":         return yen(args, values);
    case "DATE_FORMAT": return dateFormat(args, values);
    case "CONTAINS":    return contains(args, values);
    default:
      throw new CalcEvalError(`unsupported function ${name}`, "unsupported");
  }
};

const evaluateSum = (args: CalcNode[], values: CalcValues): number => {
  let sum = 0;
  for (const a of args) {
    if (a.type === "field") {
      const v = values[a.code];
      if (Array.isArray(v)) {
        for (const x of v) sum += typeof x === "number" ? x : 0;
        continue;
      }
    }
    sum += asNumber(evaluate(a, values));
  }
  return sum;
};

const roundWith = (
  args: CalcNode[],
  values: CalcValues,
  mode: "half-up" | "up" | "down",
): number => {
  const x = asNumber(evaluate(args[0]!, values));
  const digits = Math.trunc(asNumber(evaluate(args[1]!, values)));
  const factor = Math.pow(10, digits);
  const scaled = x * factor;
  const rounded = mode === "half-up" ? Math.round(scaled)
    : mode === "up"   ? Math.ceil(scaled)
    : Math.floor(scaled);
  return rounded / factor;
};

const yen = (args: CalcNode[], values: CalcValues): string => {
  const x = roundWith(args, values, "half-up");
  if (!Number.isFinite(x)) throw new CalcEvalError("invalid number", "type_mismatch");
  const digits = Math.trunc(asNumber(evaluate(args[1]!, values)));
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  const fixed = abs.toFixed(Math.max(0, digits));
  const [int, frac] = fixed.split(".");
  const withCommas = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}¥${frac ? `${withCommas}.${frac}` : withCommas}`;
};

// CONTAINS(field, value) → 0/1
// 実機では CHECK_BOX / MULTI_SELECT（複数選択 = string[]）にのみ有効。
// DROP_DOWN / RADIO_BUTTON / SINGLE_LINE_TEXT 等の単一値フィールドでは型不適合で空文字列になるため、
// ここでは type_mismatch として例外を投げて呼び出し側で "" に変換させる。
const contains = (args: CalcNode[], values: CalcValues): number => {
  const target = args[0]!;
  if (target.type !== "field") {
    throw new CalcEvalError("CONTAINS requires a field reference", "type_mismatch");
  }
  const v = values[target.code];
  if (!Array.isArray(v)) {
    throw new CalcEvalError("CONTAINS requires a multi-select field", "type_mismatch");
  }
  const needleResult = evaluate(args[1]!, values);
  const needle = typeof needleResult === "string" ? needleResult : asString(needleResult);
  return (v as Array<string | number>).some((x) => String(x) === needle) ? 1 : 0;
};

// DATE_FORMAT(timestamp_or_field, format, timezone) → string
// format トークン: YYYY YY MM M dd d HH H mm m ss s MMM
// timezone: "UTC" / "system" / IANA タイムゾーン (Asia/Tokyo 等)
const dateFormat = (args: CalcNode[], values: CalcValues): string => {
  const sec = asNumber(evaluate(args[0]!, values));
  const fmt = asString(evaluate(args[1]!, values));
  const tzArg = asString(evaluate(args[2]!, values));
  const timeZone = tzArg === "system" ? "UTC" : tzArg;
  const date = new Date(Math.floor(sec) * 1000);
  if (Number.isNaN(date.getTime())) throw new CalcEvalError("invalid date", "type_mismatch");

  const parts = extractDateParts(date, timeZone);
  return fmt.replace(
    /YYYY|YY|MMM|MM|M|dd|d|HH|H|mm|m|ss|s/g,
    (token) => parts[token] ?? token,
  );
};

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const extractDateParts = (date: Date, timeZone: string): Record<string, string> => {
  // Intl で TZ 補正された各成分を取得。Node の Intl が指定 TZ を解釈できなければ UTC にフォールバック。
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date);
  }
  const get = (t: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // 24h 表記にしても "24" になる Intl 実装があるため "00" に丸める
  const hourRaw = get("hour");
  const hour = hourRaw === "24" ? "00" : hourRaw;
  const minute = get("minute");
  const second = get("second");
  return {
    YYYY: year,
    YY:   year.slice(-2),
    MM:   month,
    M:    String(Number(month)),
    MMM:  MONTH_ABBR[Number(month) - 1] ?? "",
    dd:   day,
    d:    String(Number(day)),
    HH:   hour,
    H:    String(Number(hour)),
    mm:   minute,
    m:    String(Number(minute)),
    ss:   second,
    s:    String(Number(second)),
  };
};

const scalarToValue = (v: CalcValue | undefined): CalcResult => {
  if (v == null) return 0;
  // 配列を SUM 以外 / CONTAINS 以外で参照すると 0 / "" 相当（CONTAINS は値を直接参照する）
  if (Array.isArray(v)) return 0;
  return v;
};

export const asNumber = (v: CalcResult): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const asString = (v: CalcResult): string => {
  if (typeof v === "string") return v;
  return formatNumberAsKintone(v);
};

export const formatNumberAsKintone = (n: number): string => {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
};
