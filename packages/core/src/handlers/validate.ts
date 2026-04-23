import type { FieldRow } from "../db/fields";

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

export type ValidationErrors = { [key: string]: { messages: string[] } };

export const validateRequiredFields = (
  fieldRows: FieldRow[],
  record: Record<string, { value?: unknown }>
): ValidationErrors | null => {
  const errors: ValidationErrors = {};
  for (const row of fieldRows) {
    const def = JSON.parse(row.body) as { type: string; required?: boolean };
    if (!def.required) continue;
    if (SKIP_TYPES.has(def.type)) continue;
    if (isEmptyValue(record[row.code])) {
      errors[`record.${row.code}${errorKeySuffix(def.type)}`] = { messages: ["必須です。"] };
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
};

export const validationErrorResponse = (errors: ValidationErrors) =>
  Response.json(
    {
      code: "CB_VA01",
      id: "emulator-validation-error",
      message: "入力内容が正しくありません。",
      errors,
    },
    { status: 400 }
  );
