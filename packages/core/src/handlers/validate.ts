import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { FieldRow } from "../db/fields";
import { findRecordsByKey } from "../db/records";
import type { Decimal, NumberPrecision } from "../query/number";
import {
  compareDecimal, DEFAULT_NUMBER_PRECISION, formatPlainDecimal, integerDigitCount, parseDecimal, parseWrittenNumber,
  roundDecimal,
} from "../query/number";

// 検証・defaultValue の対象外のタイプ（自動計算・レイアウトなど）
const SKIP_TYPES = new Set([
  "RECORD_NUMBER", "__REVISION__",
  "CREATED_TIME", "UPDATED_TIME", "CREATOR", "MODIFIER",
  "CALC", "STATUS", "STATUS_ASSIGNEE", "CATEGORY",
  "GROUP", "LABEL", "SPACER", "HR", "REFERENCE_TABLE",
]);

const VALUES_KEY_TYPES: Record<string, string> = {
  CHECK_BOX: ".values",
  MULTI_SELECT: ".values",
  FILE: ".values",
  USER_SELECT: ".values.value",
  ORGANIZATION_SELECT: ".values.value",
  GROUP_SELECT: ".values.value",
};

const errorKeySuffix = (type: string) => VALUES_KEY_TYPES[type] ?? ".value";

const isEmptyValue = (field: { value?: unknown } | undefined): boolean => {
  if (field == null) return true;
  const v = field.value;
  if (v == null) return true;
  if (typeof v === "string") return v === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
};

export type Locale = "ja" | "en";

// Accept-Language が明示的に "ja" 以外で指定されていれば英語。
// ヘッダー無し / "*"（undici の自動付与値）/ 空は日本語（実 kintone のデフォルトに合わせる）。
export const detectLocale = (acceptLanguage: string | null | undefined): Locale => {
  if (!acceptLanguage) return "ja";
  const first = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first || first === "*") return "ja";
  return first.startsWith("ja") ? "ja" : "en";
};

type Messages = {
  topLevel: string;
  required: string;
  unique: string;
  maxLength: (n: number) => string;
  minLength: (n: number) => string;
  maxValue: (v: string) => string;
  minValue: (v: string) => string;
  nan: string;
  digits: string;
  notInOptions: (v: string) => string;
};

const MESSAGES: Record<Locale, Messages> = {
  ja: {
    topLevel:  "入力内容が正しくありません。",
    required:  "必須です。",
    unique:    "値がほかのレコードと重複しています。",
    maxLength: (n) => `${n}文字より短くなければなりません。`,
    minLength: (n) => `${n}文字より長くなければなりません。`,
    maxValue:  (v) => `${v}以下である必要があります。`,
    minValue:  (v) => `${v}以上である必要があります。`,
    nan:       "数字でなければなりません。",
    digits:    "有効桁数を超えています。",
    notInOptions: (v) => `"${v}"は選択肢にありません。`,
  },
  en: {
    topLevel:  "Missing or invalid input.",
    required:  "Required.",
    unique:    "This value already exists in another record.",
    maxLength: (n) => `Enter less than ${n} characters.`,
    minLength: (n) => `Enter more than ${n} characters.`,
    maxValue:  (v) => `The value must be ${v} or less.`,
    minValue:  (v) => `The value must be ${v} or more.`,
    nan:       "Only numbers are allowed.",
    digits:    "The number of digits exceeds the maximum allowed.",
    notInOptions: (v) => `The value, "${v}", is not in options.`,
  },
};

type FieldDef = {
  type: string;
  required?: boolean;
  unique?: boolean;
  maxLength?: string;
  minLength?: string;
  maxValue?: string;
  minValue?: string;
  options?: Record<string, { label: string; index: string }>;
  defaultValue?: string | unknown[];
  defaultNowValue?: boolean;
  fields?: Record<string, FieldDef>;
};

type ParsedField = { code: string; def: FieldDef };

const parseFields = (fieldRows: FieldRow[]): ParsedField[] =>
  fieldRows.map((row) => ({ code: row.code, def: JSON.parse(row.body) as FieldDef }));

// SUBTABLE の `fields` オブジェクトを FieldRow[] 相当（applyDefaults 用）に変換
const subtableFieldsToRows = (fields: Record<string, FieldDef>): FieldRow[] =>
  Object.entries(fields).map(([code, def]) => ({ code, body: JSON.stringify(def) }));

// SUBTABLE の `fields` オブジェクトを ParsedField[] に変換
const subtableFieldsToParsed = (fields: Record<string, FieldDef>): ParsedField[] =>
  Object.entries(fields).map(([code, def]) => ({ code, def }));

export type ValidationErrors = { [key: string]: { messages: string[] } };

// レコードのフィールド 1 つ分のセル。入力時は `type` 無し、レスポンス時は `type` が付く。
type RecordCell = { value?: unknown; type?: string };
type RecordInput = Record<string, RecordCell>;
type SubtableRow = { id?: string; value?: RecordInput };

const pad2 = (n: number) => String(n).padStart(2, "0");
// DATE: ローカル日付 "YYYY-MM-DD"
const nowDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// DATETIME: UTC "YYYY-MM-DDTHH:MM:SSZ"（秒を 00 に丸める）
const nowDateTime = (d = new Date()) => {
  const copy = new Date(d);
  copy.setUTCSeconds(0, 0);
  return copy.toISOString().replace(/\.\d{3}Z$/, "Z");
};
// TIME: ローカル時刻 "HH:MM"
const nowTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// SUBTABLE 行 ID。既存 ID は保持し、無ければ生成
const generateRowId = () => crypto.randomBytes(6).toString("hex");

// NUMBER を実 kintone の保存時挙動に合わせて正規化する。値は失わない (丸めは roundNumbers で行う)。
// 丸めをここでしないのは、実機が最大値・最小値を丸める前の値で判定するため
// (maxValue 10 に 10.00004 を書くと、小数第 4 位に丸めれば 10 なのにエラーになる)。
// 共通:
//   - 解釈可能 → 指数表記を展開した通常の表記に置換（例: "1.5e1" → "15", " 42 " → "42"）
// top-level NUMBER:
//   - 解釈不能（"abc" / ".5" 等） → そのまま残す（後段の validateRanges が `record[<code>].value` でエラー化）
// SUBTABLE 内 NUMBER:
//   - 解釈不能 → "" に置換（実機はエラーにならず空文字列で保存する）
// 受け付ける書式は parseWrittenNumber を参照。
export const normalizeNumbers = (fieldRows: FieldRow[], record: RecordInput): RecordInput =>
  mapNumberCells(fieldRows, record, (v, location) => {
    const d = parseWrittenNumber(v, location);
    if (!d) return location === "subtable" ? "" : v;
    // `1e999999` のような値を展開すると巨大な文字列になる。桁数の検証で弾かれるか
    // 丸めで 0 になる値なので、元の表記のまま後段に渡す
    return Math.abs(d.exponent) <= MAX_EXPANDED_EXPONENT ? formatPlainDecimal(d) : v;
  });

/** 数値精度の digits の上限は 30 なので、これを超える指数は必ず桁数超過か丸めで 0 になる */
const MAX_EXPANDED_EXPONENT = 64;

/** 検証を通ったレコードの NUMBER をアプリの数値精度で丸める。保存直前に呼ぶ */
export const roundNumbers = (fieldRows: FieldRow[], record: RecordInput, precision: NumberPrecision): RecordInput =>
  mapNumberCells(fieldRows, record, (v, location) => {
    const d = parseWrittenNumber(v, location);
    if (!d) return v;
    return formatPlainDecimal(roundDecimal(d, Number(precision.decimalPlaces), precision.roundingMode));
  });

// 実機は JSON の数値で送られても文字列と同じく正規化・丸めして文字列で保存する。
// 数値のまま素通しすると、正規化と丸めを経ずに JS の number が保存されてしまう
const numberCellString = (v: unknown): string | null => {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v !== "" ? v : null;
};

/** top-level と SUBTABLE 内の NUMBER の、空でない値を置き換える */
const mapNumberCells = (
  fieldRows: FieldRow[],
  record: RecordInput,
  fn: (value: string, location: "top" | "subtable") => string,
): RecordInput => {
  const result: RecordInput = { ...record };
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;

    if (def.type === "NUMBER") {
      const cell = result[row.code];
      if (cell == null) continue;
      const v = numberCellString(cell.value);
      if (v == null) continue;
      result[row.code] = { ...cell, value: fn(v, "top") };
      continue;
    }

    if (def.type === "SUBTABLE" && def.fields) {
      const rows = result[row.code]?.value;
      if (!Array.isArray(rows)) continue;
      const numberCodes = Object.entries(def.fields)
        .filter(([, f]) => f.type === "NUMBER")
        .map(([code]) => code);
      if (numberCodes.length === 0) continue;
      const newRows: SubtableRow[] = (rows as SubtableRow[]).map((r) => {
        const val: RecordInput = { ...(r.value ?? {}) };
        for (const code of numberCodes) {
          const cell = val[code];
          if (cell == null) continue;
          const v = numberCellString(cell.value);
          if (v == null) continue;
          val[code] = { ...cell, value: fn(v, "subtable") };
        }
        return { ...r, value: val };
      });
      result[row.code] = { ...result[row.code], value: newRows };
    }
  }
  return result;
};

// 実 kintone: DROP_DOWN は未選択を `value: null` で保存・返却する。
//   - 未送信フィールド → `{ value: null }` を補完
//   - 空文字列で送信   → null に正規化
//   - SUBTABLE 内の DROP_DOWN にも同じ処理を適用（行が無い場合は何もしない）
// 適用後の body は getRecord / getRecords でも `{ type: "DROP_DOWN", value: null }` として返る。
export const normalizeDropDown = (fieldRows: FieldRow[], record: RecordInput): RecordInput => {
  const result: RecordInput = { ...record };
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;

    if (def.type === "DROP_DOWN") {
      const cell = result[row.code];
      if (cell == null) {
        result[row.code] = { value: null };
      } else if (cell.value === "" || cell.value == null) {
        result[row.code] = { ...cell, value: null };
      }
      continue;
    }

    if (def.type === "SUBTABLE" && def.fields) {
      const rows = result[row.code]?.value;
      if (!Array.isArray(rows)) continue;
      const subRows = subtableFieldsToRows(def.fields);
      const newRows: SubtableRow[] = (rows as SubtableRow[]).map((r) => ({
        ...r,
        value: normalizeDropDown(subRows, r.value ?? {}),
      }));
      result[row.code] = { ...result[row.code], value: newRows };
    }
  }
  return result;
};

// PUT 用: body.record 側の SUBTABLE 行を、既存レコード body 側の行と id でマッチングしてマージする。
// 実 kintone の PUT 挙動:
//   - 送信された id が既存行に一致 → 既存行の value と送信 value をマージ（送らない内部フィールドは既存値を保持）
//   - id 未指定 / 既存に無い id → 新規行扱いで新しい id を採番（実機も任意の id は破棄して振り直す）
//   - 送信配列に無い既存行は削除（配列全体で置き換える）
//   - 該当 SUBTABLE キーが送られなかった場合はこの関数は何もしない（呼び出し側の spread merge で既存が保持される）
export const mergeSubtableRows = (
  fieldRows: FieldRow[],
  existing: RecordInput,
  incoming: RecordInput,
): RecordInput => {
  const result: RecordInput = { ...incoming };
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;
    if (def.type !== "SUBTABLE") continue;
    if (!(row.code in incoming)) continue;
    const incomingVal = incoming[row.code]?.value;
    if (!Array.isArray(incomingVal)) continue;
    const existingRaw = existing[row.code]?.value;
    const existingRows: SubtableRow[] = Array.isArray(existingRaw) ? (existingRaw as SubtableRow[]) : [];
    const existingById = new Map<string, SubtableRow>();
    for (const r of existingRows) if (r.id) existingById.set(r.id, r);

    const newRows: SubtableRow[] = (incomingVal as SubtableRow[]).map((r) => {
      const existed = r.id != null ? existingById.get(r.id) : undefined;
      if (existed) {
        return {
          id: existed.id,
          value: { ...(existed.value ?? {}), ...(r.value ?? {}) },
        };
      }
      return { id: generateRowId(), value: r.value ?? {} };
    });
    result[row.code] = { ...incoming[row.code], value: newRows };
  }
  return result;
};

// 未送信フィールドに defaultValue / defaultNowValue を補完する。
// 実 kintone の挙動:
//   - record に key が存在しない場合のみ補完（`{value:""}` / `{value:[]}` は明示的な空として尊重）
//   - defaultNowValue は DATE/DATETIME/TIME で defaultValue より優先
//   - SUBTABLE は送られた各行に再帰適用（行内の未送信フィールドを defaultValue で埋める）、行 ID も補う
export const applyDefaults = (fieldRows: FieldRow[], record: RecordInput): RecordInput => {
  const result: RecordInput = { ...record };
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;

    if (def.type === "SUBTABLE" && def.fields) {
      const existing = result[row.code] as { value?: unknown } | undefined;
      const rows = existing?.value;
      if (Array.isArray(rows)) {
        const subRows = subtableFieldsToRows(def.fields);
        const newRows: SubtableRow[] = (rows as SubtableRow[]).map((r) => ({
          id: r.id ?? generateRowId(),
          value: applyDefaults(subRows, r.value ?? {}),
        }));
        result[row.code] = { ...existing, value: newRows };
      }
      continue;
    }

    if (row.code in result) continue;
    if (def.defaultNowValue === true) {
      if (def.type === "DATE")     { result[row.code] = { value: nowDate() }; continue; }
      if (def.type === "DATETIME") { result[row.code] = { value: nowDateTime() }; continue; }
      if (def.type === "TIME")     { result[row.code] = { value: nowTime() }; continue; }
    }
    if (def.defaultValue != null) {
      if (typeof def.defaultValue === "string" && def.defaultValue === "") continue;
      if (Array.isArray(def.defaultValue) && def.defaultValue.length === 0) continue;
      result[row.code] = { value: def.defaultValue };
    }
  }
  return result;
};

const addError = (errors: ValidationErrors, key: string, message: string) => {
  if (errors[key]) {
    errors[key].messages.push(message);
  } else {
    errors[key] = { messages: [message] };
  }
};

const validateRequired = (fields: ParsedField[], record: RecordInput, errors: ValidationErrors, m: Messages, prefix: string) => {
  for (const { code, def } of fields) {
    if (!def.required) continue;
    if (SKIP_TYPES.has(def.type)) continue;
    if (def.type === "SUBTABLE") continue;
    if (isEmptyValue(record[code])) {
      addError(errors, `${prefix}.${code}${errorKeySuffix(def.type)}`, m.required);
    }
  }
};

// MULTI_LINE_TEXT は実機の設定画面でも maxLength / minLength を指定できず、
// API レベルでも検証されない。ここからは除外する
const LENGTH_TYPES = new Set(["SINGLE_LINE_TEXT", "LINK"]);

const validateLengths = (fields: ParsedField[], record: RecordInput, errors: ValidationErrors, m: Messages, prefix: string) => {
  for (const { code, def } of fields) {
    if (!LENGTH_TYPES.has(def.type)) continue;
    const raw = record[code]?.value;
    const strValue = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
    const max = def.maxLength != null && def.maxLength !== "" ? Number(def.maxLength) : null;
    const min = def.minLength != null && def.minLength !== "" ? Number(def.minLength) : null;
    // 実機準拠: minLength は未送信 / 空文字でも検証する。maxLength は空のときはスキップ
    if (strValue !== "" && max != null && strValue.length > max) {
      addError(errors, `${prefix}.${code}.value`, m.maxLength(max + 1));
    }
    if (min != null && strValue.length < min) {
      addError(errors, `${prefix}.${code}.value`, m.minLength(min - 1));
    }
  }
};

const parseBound = (v: string | undefined): Decimal | null =>
  v != null && v !== "" ? parseDecimal(v) : null;

// 最大値・最小値は丸める前の値で、桁数は丸めた後の値で判定する（実機観察）。
// 丸めた後で見るのは、16 桁 / 小数 4 桁の設定で 999999999999.99995 が 1000000000000 に繰り上がって
// 整数部 13 桁になり弾かれる一方、5 桁 / 小数 2 桁の設定で 1.99999 が 2 として保存されるため
// （丸める前の全体の桁数で判定すると後者も弾かれてしまう）
const validateRanges = (
  fields: ParsedField[],
  record: RecordInput,
  errors: ValidationErrors,
  m: Messages,
  prefix: string,
  precision: NumberPrecision,
) => {
  const location = prefix === "record" ? "top" : "subtable";
  for (const { code, def } of fields) {
    if (def.type !== "NUMBER") continue;
    const raw = record[code]?.value;
    if (raw == null || raw === "") continue;
    const d = parseWrittenNumber(String(raw), location);
    if (!d) {
      // SUBTABLE 内の解釈不能値は normalizeNumbers が "" にしているのでここには来ない
      addError(errors, `record[${code}].value`, m.nan);
      continue;
    }
    const max = parseBound(def.maxValue);
    const min = parseBound(def.minValue);
    if (max && compareDecimal(d, max) > 0) {
      addError(errors, `${prefix}.${code}.value`, m.maxValue(def.maxValue!));
    }
    if (min && compareDecimal(d, min) < 0) {
      addError(errors, `${prefix}.${code}.value`, m.minValue(def.minValue!));
    }
    const decimalPlaces = Number(precision.decimalPlaces);
    const rounded = roundDecimal(d, decimalPlaces, precision.roundingMode);
    if (integerDigitCount(rounded) > Number(precision.digits) - decimalPlaces) {
      addError(errors, `${prefix}.${code}.value`, m.digits);
    }
  }
};

const validateOptions = (fields: ParsedField[], record: RecordInput, errors: ValidationErrors, m: Messages, prefix: string) => {
  for (const { code, def } of fields) {
    if (!def.options) continue;
    const v = record[code]?.value;
    switch (def.type) {
      case "RADIO_BUTTON":
      case "DROP_DOWN": {
        if (typeof v !== "string" || v === "") continue;
        if (!(v in def.options)) {
          addError(errors, `${prefix}.${code}.value`, m.notInOptions(v));
        }
        break;
      }
      case "CHECK_BOX":
      case "MULTI_SELECT": {
        if (!Array.isArray(v)) continue;
        v.forEach((item, index) => {
          if (typeof item !== "string") return;
          if (!(item in def.options!)) {
            addError(errors, `${prefix}.${code}.values[${index}].value`, m.notInOptions(item));
          }
        });
        break;
      }
    }
  }
};

const validateUnique = (
  fields: ParsedField[],
  record: RecordInput,
  errors: ValidationErrors,
  m: Messages,
  ctx: ValidateContext & { numberPrecision: NumberPrecision }
) => {
  // unique は top-level かつ、実機が unique 属性を保持する 5 タイプに限定:
  //   SINGLE_LINE_TEXT / NUMBER / LINK / DATE / DATETIME
  // 実機の UI / addFormFields API では他タイプに unique: true を送っても
  // silently drop される（加えて TIME / CALC / LOOKUP は UI からも設定不可）
  for (const { code, def } of fields) {
    if (!def.unique) continue;
    if (!UNIQUE_TYPES.has(def.type)) continue;
    const raw = record[code]?.value;
    if (typeof raw !== "string" || raw === "") continue;
    // 保存済みの値は丸めてあるので、NUMBER は丸めた後の値で重複を探す
    const v = def.type === "NUMBER" ? roundedNumberString(raw, ctx.numberPrecision) : raw;
    const rows = findRecordsByKey(ctx.db, ctx.appId, code, v);
    const duplicate = rows.some((r) => ctx.excludeId == null || String(r.id) !== String(ctx.excludeId));
    if (duplicate) {
      addError(errors, `record.${code}.value`, m.unique);
    }
  }
};

const roundedNumberString = (v: string, precision: NumberPrecision): string => {
  const d = parseWrittenNumber(v, "top");
  if (!d) return v;
  return formatPlainDecimal(roundDecimal(d, Number(precision.decimalPlaces), precision.roundingMode));
};

const UNIQUE_TYPES = new Set([
  "SINGLE_LINE_TEXT",
  "NUMBER",
  "LINK",
  "DATE",
  "DATETIME",
]);

// SUBTABLE 各行の内部フィールドに対して required / 長さ / 範囲 / options を再帰検証
const validateSubtables = (
  fields: ParsedField[],
  record: RecordInput,
  errors: ValidationErrors,
  m: Messages,
  precision: NumberPrecision,
) => {
  for (const { code, def } of fields) {
    if (def.type !== "SUBTABLE" || !def.fields) continue;
    const rows = record[code]?.value;
    if (!Array.isArray(rows)) continue;
    const subFields = subtableFieldsToParsed(def.fields);
    (rows as SubtableRow[]).forEach((r, i) => {
      const rowValue = r.value ?? {};
      const rowPrefix = `record.${code}.value[${i}].value`;
      validateRequired(subFields, rowValue, errors, m, rowPrefix);
      validateLengths(subFields, rowValue, errors, m, rowPrefix);
      validateRanges(subFields, rowValue, errors, m, rowPrefix, precision);
      validateOptions(subFields, rowValue, errors, m, rowPrefix);
    });
  }
};

export type ValidateContext = {
  db: Database.Database;
  appId: number | string;
  excludeId?: number | string;
  locale?: Locale;
  /**
   * アプリの数値精度 (findAppNumberPrecision)。NUMBER の桁数検証と重複判定に使う。
   * 省略可能にしているのは、validateRecord がパッケージの公開エントリに含まれるため
   */
  numberPrecision?: NumberPrecision;
};

export const validateRecord = (
  fieldRows: FieldRow[],
  record: RecordInput,
  ctx: ValidateContext
): ValidationErrors | null => {
  const fields = parseFields(fieldRows);
  const errors: ValidationErrors = {};
  const m = MESSAGES[ctx.locale ?? "ja"];
  const numberPrecision = ctx.numberPrecision ?? DEFAULT_NUMBER_PRECISION;
  validateRequired(fields, record, errors, m, "record");
  validateLengths(fields, record, errors, m, "record");
  validateRanges(fields, record, errors, m, "record", numberPrecision);
  validateOptions(fields, record, errors, m, "record");
  validateUnique(fields, record, errors, m, { ...ctx, numberPrecision });
  validateSubtables(fields, record, errors, m, numberPrecision);
  return Object.keys(errors).length > 0 ? errors : null;
};

// DB の DATETIME（"YYYY-MM-DD HH:MM:SS" UTC）を Date に変換する内部ヘルパー。
const sqlTimeToDate = (sqlTime: string): Date => new Date(sqlTime.replace(" ", "T") + "Z");

// DB の DATETIME（"YYYY-MM-DD HH:MM:SS" UTC）を kintone の CREATED_TIME / UPDATED_TIME 形式に整形。
// 実 kintone は秒を 00 に丸めた ISO 8601 UTC（"YYYY-MM-DDTHH:MM:00Z"）で返す。
export const formatKintoneDateTime = (sqlTime: string): string => {
  const d = sqlTimeToDate(sqlTime);
  d.setUTCSeconds(0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

// DB の DATETIME（"YYYY-MM-DD HH:MM:SS" UTC）を秒を保持したまま ISO 8601 UTC
// （"YYYY-MM-DDTHH:MM:SSZ"）に整形。コメントの投稿時刻など秒精度が必要な用途で使う。
// 不正な入力（空文字・想定外フォーマット）の場合は throw せず元の値をそのまま返す。
export const formatIsoDateTime = (sqlTime: string): string => {
  const d = sqlTimeToDate(sqlTime);
  if (Number.isNaN(d.getTime())) return sqlTime;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

export type RecordMeta = {
  recordId?: number | string;
  createdAt?: string;
  updatedAt?: string;
};

// getRecord / getRecords 応答では、実 kintone と同じくレコードに値が保存されていない
// フィールドも「フィールドタイプ別の空値」で補完して返す。
//   - 文字列系（SINGLE_LINE_TEXT / NUMBER / CALC / LINK / RADIO_BUTTON / DATETIME 等） → ""
//   - null 系（DROP_DOWN / DATE / TIME）                                    → null
//   - 配列系（CHECK_BOX / FILE / USER_SELECT / SUBTABLE 等）                → []
// ※ DATE / TIME は null だが DATETIME は "" を返す（実 kintone の挙動を実機で確認済み。
//    SDK 型でも DATETIME の value だけ `string`、DATE / TIME は `string | null`）。
// このマップに含めないタイプは補完対象外:
//   - 値を持たないレイアウト系（LABEL / SPACER / HR / GROUP / REFERENCE_TABLE）
//   - システム管理でここでは補完しないもの（RECORD_NUMBER / CREATED_TIME / UPDATED_TIME は
//     meta 経由で別途補完、CREATOR / MODIFIER / STATUS / STATUS_ASSIGNEE / CATEGORY はエミュ未モデル）
// ファクトリ関数で毎回新しい配列/値を返し、セル間で参照を共有しないようにする。
const EMPTY_VALUE_FACTORIES: Record<string, () => unknown> = {
  SINGLE_LINE_TEXT: () => "",
  MULTI_LINE_TEXT: () => "",
  RICH_TEXT: () => "",
  NUMBER: () => "",
  CALC: () => "",
  LINK: () => "",
  RADIO_BUTTON: () => "",
  DATETIME: () => "",
  DROP_DOWN: () => null,
  DATE: () => null,
  TIME: () => null,
  CHECK_BOX: () => [],
  MULTI_SELECT: () => [],
  FILE: () => [],
  USER_SELECT: () => [],
  ORGANIZATION_SELECT: () => [],
  GROUP_SELECT: () => [],
  SUBTABLE: () => [],
};

// getRecord / getRecords 応答で各フィールドに type を注入するヘルパー。
// - SUBTABLE の場合は行内の各フィールドにも type を注入する
// - meta が渡された場合、システムフィールド（RECORD_NUMBER / CREATED_TIME / UPDATED_TIME）の
//   フィールドコードに対して `{type, value}` を補完する（body には保存されていないため）
export const attachFieldTypes = (
  body: RecordInput,
  fieldRows: FieldRow[],
  meta: RecordMeta = {},
): void => {
  const topTypes: Record<string, string> = {};
  const subTypes: Record<string, Record<string, string>> = {};
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as FieldDef;
    topTypes[row.code] = def.type;
    if (def.type === "SUBTABLE" && def.fields) {
      subTypes[row.code] = {};
      for (const [c, f] of Object.entries(def.fields)) {
        subTypes[row.code]![c] = f.type;
      }
    }
    if (row.code in body) continue;
    if (def.type === "RECORD_NUMBER" && meta.recordId != null) {
      body[row.code] = { type: "RECORD_NUMBER", value: String(meta.recordId) };
    } else if (def.type === "CREATED_TIME" && meta.createdAt != null) {
      body[row.code] = { type: "CREATED_TIME", value: formatKintoneDateTime(meta.createdAt) };
    } else if (def.type === "UPDATED_TIME" && meta.updatedAt != null) {
      body[row.code] = { type: "UPDATED_TIME", value: formatKintoneDateTime(meta.updatedAt) };
    } else {
      // 値が保存されていないフィールドは、タイプ別の空値で補完する（実 kintone 準拠）
      const emptyValue = EMPTY_VALUE_FACTORIES[def.type];
      if (emptyValue) {
        body[row.code] = { type: def.type, value: emptyValue() };
      }
    }
  }
  for (const code of Object.keys(body)) {
    const t = topTypes[code];
    if (!t) continue;
    body[code]!.type = t;
    if (t === "SUBTABLE") {
      const rows = body[code]?.value;
      if (!Array.isArray(rows)) continue;
      for (const r of rows as SubtableRow[]) {
        if (!r.value) continue;
        for (const c of Object.keys(r.value)) {
          const st = subTypes[code]?.[c];
          if (st) r.value[c]!.type = st;
        }
      }
    }
  }
};

export { errorInvalidInput as validationErrorResponse } from "./errors";
