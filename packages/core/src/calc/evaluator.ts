// 計算式の評価器。値は数値 / 文字列 / 真偽値 / 未入力 (null) / SUBTABLE 列の配列を区別する。
//
// 数値は JS の number ではなく 10 進数 (query/number.ts の Decimal) で持つ。実機は数値リテラルと
// 演算の途中結果を 1 つずつアプリの数値精度で丸め、整数部の桁数超過をエラーにする
// (既定の精度で 1/3*3 = 0.9999、0.00015*10000 = 2、999999999999*10/10 = "")。
// 浮動小数点で計算してから最後に丸めると、この途中の丸めと桁数超過を再現できない。

import {
  type Decimal,
  type NumberPrecision,
  addDecimal,
  compareDecimal,
  DEFAULT_NUMBER_PRECISION,
  decimalToNumber,
  divideDecimal,
  formatPlainDecimal,
  integerDigitCount,
  multiplyDecimal,
  negateDecimal,
  parseDecimal,
  powerDecimal,
  roundDecimal,
  subtractDecimal,
  type RoundingMode,
} from "../query/number";
import type { CalcNode } from "./ast";

/** フィールドから渡す値。null は未入力 */
export type CalcValue =
  | { kind: "number"; value: Decimal }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "null" }
  | { kind: "numbers"; value: Decimal[] }
  | { kind: "strings"; value: string[] };
export type CalcValues = Record<string, CalcValue | undefined>;

/** 式の評価結果 (配列は SUM / CONTAINS の引数にしか現れない) */
export type CalcResult = Exclude<CalcValue, { kind: "numbers" } | { kind: "strings" }>;

export class CalcEvalError extends Error {
  constructor(
    message: string,
    public readonly kind: "unsupported" | "divide_by_zero" | "overflow" | "type_mismatch",
  ) {
    super(message);
  }
}

export type EvalContext = { numberPrecision: NumberPrecision };

const DEFAULT_CONTEXT: EvalContext = { numberPrecision: DEFAULT_NUMBER_PRECISION };

const NULL: CalcResult = { kind: "null" };
const ZERO = parseDecimal("0")!;

export const evaluate = (node: CalcNode, values: CalcValues, ctx: EvalContext = DEFAULT_CONTEXT): CalcResult =>
  new Evaluator(values, ctx).eval(node);

class Evaluator {
  private readonly places: number;
  private readonly mode: RoundingMode;

  constructor(private readonly values: CalcValues, private readonly ctx: EvalContext) {
    this.places = Number(ctx.numberPrecision.decimalPlaces);
    this.mode = ctx.numberPrecision.roundingMode;
  }

  /**
   * 数値をアプリの数値精度に丸め、整数部の桁数超過をエラーにする。
   * リテラル・フィールド値・演算と関数の結果のすべてに通す (実機は途中の値ごとに丸める)
   */
  private normalize(d: Decimal): CalcResult {
    const rounded = roundDecimal(d, this.places, this.mode);
    const maxIntegerDigits = Number(this.ctx.numberPrecision.digits) - this.places;
    if (integerDigitCount(rounded) > maxIntegerDigits) {
      throw new CalcEvalError("number of digits exceeded", "overflow");
    }
    return { kind: "number", value: rounded };
  }

  eval(node: CalcNode): CalcResult {
    switch (node.type) {
      // lexer が Number にしているので、16 桁を超えるリテラルは丸まっている。計算式に書く桁数としては十分
      case "number": return this.normalize(parseDecimal(String(node.value))!);
      case "string": return { kind: "string", value: node.value };
      case "bool":   return { kind: "bool", value: node.value };
      case "field":  return this.field(node.code);
      case "unary": {
        const v = this.num(this.eval(node.expr));
        return this.normalize(node.op === "-" ? negateDecimal(v) : v);
      }
      case "binary": return this.binary(node.op, node.left, node.right);
      case "call":   return this.call(node.name.toUpperCase(), node.args);
      default:
        throw new CalcEvalError(`unsupported node ${(node as CalcNode).type}`, "unsupported");
    }
  }

  private field(code: string): CalcResult {
    const v = this.values[code];
    if (v == null) return NULL;
    switch (v.kind) {
      case "number": return this.normalize(v.value);
      // SUBTABLE 列を SUM / CONTAINS 以外で参照したときは 0 扱い (従来の挙動。実機で確かめていない)
      case "numbers":
      case "strings": return { kind: "number", value: ZERO };
      default: return v;
    }
  }

  /**
   * 算術・比較のオペランドとしての数値。未入力は 0 (実機は n + 1 を 1、n = 0 を真にする)。
   * 真偽値はエラー (実機は (1>0) + 1 を "" にする)
   */
  private num(v: CalcResult): Decimal {
    switch (v.kind) {
      case "number": return v.value;
      case "null":   return ZERO;
      case "bool":   throw new CalcEvalError("boolean used as number", "type_mismatch");
      case "string": return parseDecimal(v.value.trim()) ?? ZERO;
    }
  }

  /** IF の条件・AND / OR / NOT の引数。真偽値以外はエラー (実機は IF(1, …) / AND(1, 1) を "" にする) */
  private bool(v: CalcResult): boolean {
    if (v.kind !== "bool") throw new CalcEvalError("condition must be boolean", "type_mismatch");
    return v.value;
  }

  private binary(op: string, left: CalcNode, right: CalcNode): CalcResult {
    if (op === "&") {
      return { kind: "string", value: asString(this.eval(left)) + asString(this.eval(right)) };
    }
    const l = this.num(this.eval(left));
    const r = this.num(this.eval(right));
    switch (op) {
      case "+": return this.normalize(addDecimal(l, r));
      case "-": return this.normalize(subtractDecimal(l, r));
      case "*": return this.normalize(multiplyDecimal(l, r));
      case "/": {
        const q = divideDecimal(l, r, this.places, this.mode);
        if (!q) throw new CalcEvalError("divide by zero", "divide_by_zero");
        return this.normalize(q);
      }
      case "^": {
        // 指数の小数部は切り捨て (実機観察: 4 ^ 1.5 = 4)
        const exp = Math.trunc(decimalToNumber(r));
        if (exp > 100 || exp < -100) throw new CalcEvalError("exponent out of range", "overflow");
        // 途中の累乗ではなく結果だけを丸めて桁数を見る (実機は小数 2 桁の設定でも 2 ^ -20 を計算できる)
        const p = powerDecimal(l, exp, this.places, this.mode);
        if (!p) throw new CalcEvalError("divide by zero", "divide_by_zero");
        return this.normalize(p);
      }
      case "=":  return { kind: "bool", value: compareDecimal(l, r) === 0 };
      case "!=": return { kind: "bool", value: compareDecimal(l, r) !== 0 };
      case "<":  return { kind: "bool", value: compareDecimal(l, r) < 0 };
      case "<=": return { kind: "bool", value: compareDecimal(l, r) <= 0 };
      case ">":  return { kind: "bool", value: compareDecimal(l, r) > 0 };
      case ">=": return { kind: "bool", value: compareDecimal(l, r) >= 0 };
      default:
        throw new CalcEvalError(`unsupported operator ${op}`, "unsupported");
    }
  }

  private call(name: string, args: CalcNode[]): CalcResult {
    switch (name) {
      case "SUM":         return this.sum(args);
      // 分岐先の値は未入力も含めてそのまま返す (実機は IF(1>0, n, 2) を n が未入力なら "" にする)
      case "IF":          return this.eval(args[this.bool(this.eval(args[0]!)) ? 1 : 2]!);
      case "AND":         return { kind: "bool", value: args.map((a) => this.bool(this.eval(a))).every(Boolean) };
      case "OR":          return { kind: "bool", value: args.map((a) => this.bool(this.eval(a))).some(Boolean) };
      case "NOT":         return { kind: "bool", value: !this.bool(this.eval(args[0]!)) };
      case "ROUND":       return this.normalize(this.roundArgs(args, "HALF_UP"));
      case "ROUNDUP":     return this.normalize(this.roundArgs(args, "UP"));
      case "ROUNDDOWN":   return this.normalize(this.roundArgs(args, "DOWN"));
      case "YEN":         return { kind: "string", value: this.yen(args) };
      case "DATE_FORMAT": return { kind: "string", value: this.dateFormat(args) };
      case "CONTAINS":    return { kind: "bool", value: this.contains(args) };
      default:
        throw new CalcEvalError(`unsupported function ${name}`, "unsupported");
    }
  }

  private sum(args: CalcNode[]): CalcResult {
    let total = ZERO;
    for (const a of args) {
      const v = a.type === "field" ? this.values[a.code] : undefined;
      if (v?.kind === "numbers") {
        // 行が 1 つも無い SUBTABLE 列は、未入力 (0 扱い) ではなくエラーとして伝わる
        // (実機は SUM(qty) + 1 も "" にする。空の行が 1 つあれば 0)
        if (v.value.length === 0) throw new CalcEvalError("empty subtable", "type_mismatch");
        for (const x of v.value) total = addDecimal(total, x);
        continue;
      }
      total = addDecimal(total, this.num(this.eval(a)));
    }
    return this.normalize(total);
  }

  private roundArgs(args: CalcNode[], mode: RoundingMode): Decimal {
    const x = this.num(this.eval(args[0]!));
    const places = Math.trunc(decimalToNumber(this.num(this.eval(args[1]!))));
    return roundDecimal(x, places, mode);
  }

  private yen(args: CalcNode[]): string {
    const x = this.roundArgs(args, "HALF_UP");
    const places = Math.max(0, Math.trunc(decimalToNumber(this.num(this.eval(args[1]!)))));
    const plain = formatPlainDecimal(x);
    const sign = plain.startsWith("-") ? "-" : "";
    const [int, frac = ""] = plain.replace(/^-/, "").split(".");
    const withCommas = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const fixedFrac = places > 0 ? `.${frac.padEnd(places, "0")}` : "";
    return `${sign}¥${withCommas}${fixedFrac}`;
  }

  // CONTAINS は真偽値を返す。IF の条件には真偽値しか書けないので、数値を返すと
  // IF(CONTAINS(...), …) が常にエラーになってしまう
  // 実機では CHECK_BOX / MULTI_SELECT（複数選択）と SUBTABLE 内の文字列列にのみ有効。
  // 単一値フィールドでは型不適合で空文字列になるため、例外を投げて呼び出し側で "" に変換させる。
  private contains(args: CalcNode[]): boolean {
    const target = args[0]!;
    if (target.type !== "field") {
      throw new CalcEvalError("CONTAINS requires a field reference", "type_mismatch");
    }
    const v = this.values[target.code];
    if (v?.kind !== "strings") {
      throw new CalcEvalError("CONTAINS requires a multi-select field", "type_mismatch");
    }
    const needle = asString(this.eval(args[1]!));
    return v.value.some((x) => x === needle);
  }

  // DATE_FORMAT(timestamp_or_field, format, timezone) → string
  // format トークン: YYYY YY MM M dd d HH H mm m ss s MMM
  // timezone: "UTC" / "system" / IANA タイムゾーン (Asia/Tokyo 等)
  private dateFormat(args: CalcNode[]): string {
    const sec = decimalToNumber(this.num(this.eval(args[0]!)));
    const fmt = asString(this.eval(args[1]!));
    const tzArg = asString(this.eval(args[2]!));
    const timeZone = tzArg === "system" ? "UTC" : tzArg;
    const date = new Date(Math.floor(sec) * 1000);
    if (Number.isNaN(date.getTime())) throw new CalcEvalError("invalid date", "type_mismatch");

    const parts = extractDateParts(date, timeZone);
    return fmt.replace(
      /YYYY|YY|MMM|MM|M|dd|d|HH|H|mm|m|ss|s/g,
      (token) => parts[token] ?? token,
    );
  }
}

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

/**
 * `&` での連結と文字列の自動計算 (SINGLE_LINE_TEXT の expression) の結果に使う文字列表現。
 * 未入力は ""、真偽値は "true" / "false" (実機は (1>0) & "x" を "truex" にする)
 */
export const asString = (v: CalcResult): string => {
  switch (v.kind) {
    case "string": return v.value;
    case "number": return formatPlainDecimal(v.value);
    case "bool":   return v.value ? "true" : "false";
    case "null":   return "";
  }
};
