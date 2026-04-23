import type Database from "better-sqlite3";
import type { FieldRow } from "../db/fields";
import { findRecordsByKey } from "../db/records";

const SKIP_TYPES = new Set([
  "RECORD_NUMBER", "__REVISION__",
  "CREATED_TIME", "UPDATED_TIME", "CREATOR", "MODIFIER",
  "CALC", "STATUS", "STATUS_ASSIGNEE", "CATEGORY",
  "GROUP", "LABEL", "SPACER", "HR", "REFERENCE_TABLE",
  "SUBTABLE",
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
};

type ParsedField = { code: string; def: FieldDef };

const parseFields = (fieldRows: FieldRow[]): ParsedField[] =>
  fieldRows.map((row) => ({ code: row.code, def: JSON.parse(row.body) as FieldDef }));

export type ValidationErrors = { [key: string]: { messages: string[] } };

type RecordInput = Record<string, { value?: unknown }>;

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

// 未送信フィールドに defaultValue / defaultNowValue を補完する。
// 実 kintone の挙動:
//   - record に key が存在しない場合のみ補完（`{value:""}` / `{value:[]}` は明示的な空として尊重）
//   - defaultNowValue は DATE/DATETIME/TIME で defaultValue より優先
export const applyDefaults = (fieldRows: FieldRow[], record: RecordInput): RecordInput => {
  const result: RecordInput = { ...record };
  for (const row of fieldRows) {
    if (row.code in result) continue;
    const def = JSON.parse(row.body) as FieldDef;
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

const validateRequired = (fields: ParsedField[], record: RecordInput, errors: ValidationErrors, m: Messages) => {
  for (const { code, def } of fields) {
    if (!def.required) continue;
    if (SKIP_TYPES.has(def.type)) continue;
    if (isEmptyValue(record[code])) {
      addError(errors, `record.${code}${errorKeySuffix(def.type)}`, m.required);
    }
  }
};

const LENGTH_TYPES = new Set(["SINGLE_LINE_TEXT", "MULTI_LINE_TEXT", "LINK"]);

const validateLengths = (fields: ParsedField[], record: RecordInput, errors: ValidationErrors, m: Messages) => {
  for (const { code, def } of fields) {
    if (!LENGTH_TYPES.has(def.type)) continue;
    const v = record[code]?.value;
    if (typeof v !== "string" || v === "") continue;
    const max = def.maxLength != null && def.maxLength !== "" ? Number(def.maxLength) : null;
    const min = def.minLength != null && def.minLength !== "" ? Number(def.minLength) : null;
    if (max != null && v.length > max) {
      addError(errors, `record.${code}.value`, m.maxLength(max + 1));
    }
    if (min != null && v.length < min) {
      addError(errors, `record.${code}.value`, m.minLength(min - 1));
    }
  }
};

const validateRanges = (fields: ParsedField[], record: RecordInput, errors: ValidationErrors, m: Messages) => {
  for (const { code, def } of fields) {
    if (def.type !== "NUMBER") continue;
    const raw = record[code]?.value;
    if (raw == null || raw === "") continue;
    const s = String(raw);
    const n = Number(s);
    if (!Number.isFinite(n)) {
      addError(errors, `record[${code}].value`, m.nan);
      continue;
    }
    const max = def.maxValue != null && def.maxValue !== "" ? Number(def.maxValue) : null;
    const min = def.minValue != null && def.minValue !== "" ? Number(def.minValue) : null;
    if (max != null && n > max) {
      addError(errors, `record.${code}.value`, m.maxValue(def.maxValue!));
    }
    if (min != null && n < min) {
      addError(errors, `record.${code}.value`, m.minValue(def.minValue!));
    }
  }
};

const validateOptions = (fields: ParsedField[], record: RecordInput, errors: ValidationErrors, m: Messages) => {
  for (const { code, def } of fields) {
    if (!def.options) continue;
    const v = record[code]?.value;
    switch (def.type) {
      case "RADIO_BUTTON":
      case "DROP_DOWN": {
        if (typeof v !== "string" || v === "") continue;
        if (!(v in def.options)) {
          addError(errors, `record.${code}.value`, m.notInOptions(v));
        }
        break;
      }
      case "CHECK_BOX":
      case "MULTI_SELECT": {
        if (!Array.isArray(v)) continue;
        v.forEach((item, index) => {
          if (typeof item !== "string") return;
          if (!(item in def.options!)) {
            addError(errors, `record.${code}.values[${index}].value`, m.notInOptions(item));
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
  ctx: ValidateContext
) => {
  for (const { code, def } of fields) {
    if (!def.unique) continue;
    if (VALUES_KEY_TYPES[def.type]) continue;
    const v = record[code]?.value;
    if (typeof v !== "string" || v === "") continue;
    const rows = findRecordsByKey(ctx.db, ctx.appId, code, v);
    const duplicate = rows.some((r) => ctx.excludeId == null || String(r.id) !== String(ctx.excludeId));
    if (duplicate) {
      addError(errors, `record.${code}.value`, m.unique);
    }
  }
};

export type ValidateContext = {
  db: Database.Database;
  appId: number | string;
  excludeId?: number | string;
  locale?: Locale;
};

export const validateRecord = (
  fieldRows: FieldRow[],
  record: RecordInput,
  ctx: ValidateContext
): ValidationErrors | null => {
  const fields = parseFields(fieldRows);
  const errors: ValidationErrors = {};
  const m = MESSAGES[ctx.locale ?? "ja"];
  validateRequired(fields, record, errors, m);
  validateLengths(fields, record, errors, m);
  validateRanges(fields, record, errors, m);
  validateOptions(fields, record, errors, m);
  validateUnique(fields, record, errors, m, ctx);
  return Object.keys(errors).length > 0 ? errors : null;
};

export { errorInvalidInput as validationErrorResponse } from "./errors";
