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
