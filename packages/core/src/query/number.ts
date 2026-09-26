// NUMBER / CALC / RECORD_NUMBER のクエリ比較で使う 10 進数の解釈と比較。
//
// Number() / CAST AS REAL で比較しないのは、kintone の数値は最大 30 桁 (アプリの数値精度設定) まで
// 持てて倍精度浮動小数点では区別できない値があるため (例: 999999999999.9999 と ...9998 が丸めで近接する)。
// BigInt に桁合わせして比べる方式も採らない: `1e400` のような大きな指数で巨大な文字列を作ってしまう。
// 仮数部の数字列と指数の組で持ち、指数 → 数字列の順に比べれば割り当ては入力長に比例するだけで済む。

/** 0.d1d2d3... × 10^exponent の形。digits は先頭・末尾ゼロを除いた数字列。0 は digits が空 */
export type Decimal = { negative: boolean; digits: string; exponent: number };

// 実機のクエリで数値として受け付けられる書式。前後の空白は受け付けない (`" 5"` は 0 件になる)。
// `.5` は書き込み時は 400 だがクエリでは 0.5 として一致する (実機観察)
const NUMBER_LITERAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

// RECORD_NUMBER / $id は整数だけを受け付ける。`462e0` / `462.0` は一致しない (実機観察)
const RECORD_NUMBER_LITERAL = /^[+-]?\d+$/;

/**
 * 全角数字 (U+FF10〜FF19) を半角にする。実機はクエリ値と SUBTABLE 内の書き込み値で全角数字を数字として読む。
 * 全角の `．` `－` `＋` `ｅ` は読まない (実機観察) ので変換しない。他の文字体系の数字は確かめていない
 */
export const toHalfWidthDigits = (s: string): string =>
  s.replace(/[\uff10-\uff19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** NUMBER / CALC の値・クエリ値を解釈する。数値として解釈できなければ null */
export const parseDecimal = (s: string): Decimal | null => {
  const m = NUMBER_LITERAL.exec(s);
  if (!m) return null;
  const [, sign, intPart = "", fracPart = "", expPart] = m;
  // `.` だけ、`e5` だけのように数字が 1 つも無いものは不正
  if (intPart === "" && fracPart === "") return null;
  const all = intPart + fracPart;
  const firstNonZero = all.search(/[1-9]/);
  if (firstNonZero < 0) return { negative: false, digits: "", exponent: 0 };
  const digits = all.slice(firstNonZero).replace(/0+$/, "");
  const exponent = intPart.length - firstNonZero + Number(expPart ?? "0");
  // 指数が大きすぎて Number で表せないものは解釈できない値として扱う。実機での扱いは確かめていない
  if (!Number.isSafeInteger(exponent)) return null;
  return { negative: sign === "-", digits, exponent };
};

/** RECORD_NUMBER / $id のクエリ値を整数として解釈する。解釈できなければ null */
export const parseRecordNumber = (s: string): Decimal | null =>
  RECORD_NUMBER_LITERAL.test(s) ? parseDecimal(s) : null;

const compareMagnitude = (a: Decimal, b: Decimal): number => {
  if (a.digits === "" || b.digits === "") {
    return (a.digits === "" ? 0 : 1) - (b.digits === "" ? 0 : 1);
  }
  if (a.exponent !== b.exponent) return a.exponent < b.exponent ? -1 : 1;
  const len = Math.max(a.digits.length, b.digits.length);
  const da = a.digits.padEnd(len, "0");
  const db = b.digits.padEnd(len, "0");
  return da === db ? 0 : da < db ? -1 : 1;
};

export const compareDecimal = (a: Decimal, b: Decimal): number => {
  const aZero = a.digits === "";
  const bZero = b.digits === "";
  const aSign = aZero ? 0 : a.negative ? -1 : 1;
  const bSign = bZero ? 0 : b.negative ? -1 : 1;
  if (aSign !== bSign) return aSign < bSign ? -1 : 1;
  const mag = compareMagnitude(a, b);
  return aSign < 0 ? -mag : mag;
};

/** 比較用の正規形。SQLite 関数へプレースホルダで渡すため文字列にする */
export const formatDecimal = (d: Decimal): string =>
  d.digits === "" ? "0" : `${d.negative ? "-" : ""}0.${d.digits}e${d.exponent}`;

/**
 * SQLite 関数 `kintone_num_cmp(recordValue, literal)` の本体。
 * - recordValue が未入力 (NULL / 空文字) か解釈できなければ NULL を返す。
 *   未入力は数直線上の値ではないので、演算子ごとの扱いはコンパイラ側で COALESCE して決める
 * - literal は compiler が formatDecimal で正規化済みの文字列
 */
export const sqliteNumCmp = (recordValue: unknown, literal: unknown): number | null => {
  if (recordValue === null || recordValue === undefined) return null;
  const a = parseDecimal(String(recordValue));
  const b = parseDecimal(String(literal));
  if (!a || !b) return null;
  return compareDecimal(a, b);
};

// ============================================================
// 書き込み時の正規化 (NUMBER の保存値)
// ============================================================

/** アプリ設定の数値精度 (`/k/v1/app/settings.json` の numberPrecision と同形) */
export type NumberPrecision = {
  digits: string;
  decimalPlaces: string;
  roundingMode: "HALF_EVEN" | "UP" | "DOWN";
};

/** 実 kintone でアプリを作った直後の値 */
export const DEFAULT_NUMBER_PRECISION: NumberPrecision = { digits: "16", decimalPlaces: "4", roundingMode: "HALF_EVEN" };

// 書き込み時に受け付ける書式は top-level と SUBTABLE 内で違う (実機観察)。
// top-level は ASCII 数字で整数部が必須 (`.5` / `５` は「数字でなければなりません」)。
// SUBTABLE 内は `.5` も全角数字も受け付ける (受け付けない値は "" で保存される)。
// どちらも `0x10` / `Infinity` / `1_000` は受け付けないので、Number() での判定は使えない。
// "top-digits" は top-level の範囲・桁数の判定用。実機は top-level の全角数字を「数字でなければなりません」で
// 弾きつつ、全角数字を読んだ値で最大値・最小値と有効桁数も判定してエラーを重ねて返す
const WRITTEN_TOP_LEVEL = /^[+-]?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/;
const WRITTEN_SUBTABLE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * 書き込まれた NUMBER の値を解釈する。前後の空白は無視する (実機は `" 5 "` を 5 として保存する)。
 * "top-digits" の書式は top-level と同じで、`.5` を範囲・桁数の判定で読むかは確かめていない
 */
export const parseWrittenNumber = (s: string, location: "top" | "top-digits" | "subtable"): Decimal | null => {
  const trimmed = s.trim();
  if (location === "top") return WRITTEN_TOP_LEVEL.test(trimmed) ? parseDecimal(trimmed) : null;
  const ascii = toHalfWidthDigits(trimmed);
  const pattern = location === "top-digits" ? WRITTEN_TOP_LEVEL : WRITTEN_SUBTABLE;
  return pattern.test(ascii) ? parseDecimal(ascii) : null;
};

const ZERO: Decimal = { negative: false, digits: "", exponent: 0 };

/** 数字列に 1 を足す。桁が増えたら true を返す ("99" → ["100", true]) */
const incrementDigits = (digits: string): [string, boolean] => {
  const chars = digits.split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] !== "9") {
      chars[i] = String(Number(chars[i]) + 1);
      return [chars.join(""), false];
    }
    chars[i] = "0";
  }
  return [`1${chars.join("")}`, true];
};

/**
 * 小数第 places 位に丸める。mode は kintone の roundingMode で、実機で確かめた意味は次のとおり:
 * HALF_EVEN = 最近接偶数への丸め、UP = 0 から遠い方へ切り上げ、DOWN = 0 に近い方へ切り捨て。
 * 丸めて 0 になったら符号を落とす (実機は -0.00005 を "0" で保存する)
 */
export const roundDecimal = (d: Decimal, places: number, mode: NumberPrecision["roundingMode"]): Decimal => {
  if (d.digits === "") return ZERO;
  // 残す桁数 (仮数部の先頭から)。これ以降の桁を切る
  const keep = d.exponent + places;
  if (keep >= d.digits.length) return d;
  const kept = keep > 0 ? d.digits.slice(0, keep) : "";
  const dropped = keep > 0 ? d.digits.slice(keep) : d.digits;
  // keep < 0 のときは切る位置より上に 0 が並ぶので、切る部分は 0.5 未満
  const droppedIsBelowHalf = keep < 0 || dropped[0]! < "5";
  // digits は末尾ゼロを除いてあるので、2 桁以上残っていれば 0.5 ちょうどではない
  const droppedIsHalf = keep >= 0 && dropped === "5";
  let roundUp: boolean;
  switch (mode) {
    case "DOWN": roundUp = false; break;
    case "UP":   roundUp = true; break;
    case "HALF_EVEN":
      roundUp = droppedIsBelowHalf ? false
        : droppedIsHalf ? Number(kept.at(-1) ?? "0") % 2 === 1
        : true;
      break;
  }
  // 切り上げの基準になる桁 (小数第 places 位) の指数。kept が空のときも同じ位置に 1 を立てる
  const unitExponent = -places + 1;
  if (!roundUp) {
    if (kept === "") return ZERO;
    return { negative: d.negative, digits: kept.replace(/0+$/, ""), exponent: d.exponent };
  }
  if (kept === "") return { negative: d.negative, digits: "1", exponent: unitExponent };
  const [digits, carried] = incrementDigits(kept);
  return { negative: d.negative, digits: digits.replace(/0+$/, ""), exponent: d.exponent + (carried ? 1 : 0) };
};

/** 整数部の桁数。0.x や 0 は 0 桁 */
export const integerDigitCount = (d: Decimal): number => (d.digits === "" ? 0 : Math.max(d.exponent, 0));

/** 指数表記を使わない通常の表記 (実機の保存値の形)。"1e3" → "1000"、"1.50" → "1.5" */
export const formatPlainDecimal = (d: Decimal): string => {
  if (d.digits === "") return "0";
  const sign = d.negative ? "-" : "";
  const { digits, exponent } = d;
  if (exponent <= 0) return `${sign}0.${"0".repeat(-exponent)}${digits}`;
  if (exponent >= digits.length) return `${sign}${digits}${"0".repeat(exponent - digits.length)}`;
  return `${sign}${digits.slice(0, exponent)}.${digits.slice(exponent)}`;
};
