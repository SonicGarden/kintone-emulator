// addFormFields / setup/app.json 時に LOOKUP の fieldMappings.field が
// 同一リクエスト内 + 既存フィールドのいずれにも存在しなければ GAIA_FC01 を返す。
//
// 並び順は影響しない（実機検証済み）。SUBTABLE 内 LOOKUP は同じ SUBTABLE 内の
// inner field に対してチェックする。

import type { FieldProperties, FieldRow } from "../db/fields";

type FieldMapping = { field?: string; relatedField?: string };
type LookupDef = { fieldMappings?: FieldMapping[] };
type FieldDef = {
  type?: string;
  lookup?: LookupDef;
  fields?: Record<string, FieldDef & { code?: string }>;
};

export type MissingFieldIssue = { missingField: string };

const collectExistingTopLevelCodes = (existing: Iterable<FieldRow>): Set<string> => {
  const codes = new Set<string>();
  for (const row of existing) codes.add(row.code);
  return codes;
};

const collectExistingSubtableInnerCodes = (
  existing: Iterable<FieldRow>,
  subtableCode: string,
): Set<string> => {
  const codes = new Set<string>();
  for (const row of existing) {
    if (row.code !== subtableCode) continue;
    const def = JSON.parse(row.body) as FieldDef;
    if (def.type !== "SUBTABLE" || !def.fields) continue;
    for (const inner of Object.keys(def.fields)) codes.add(inner);
  }
  return codes;
};

export const validateLookupMappings = (
  existing: Iterable<FieldRow>,
  incoming: FieldProperties,
): MissingFieldIssue | null => {
  const existingArr = [...existing];
  const topExisting = collectExistingTopLevelCodes(existingArr);
  const topIncoming = new Set(Object.keys(incoming));

  for (const [code, raw] of Object.entries(incoming)) {
    const def = raw as FieldDef;
    if (def.lookup) {
      const issue = checkMappings(def.lookup.fieldMappings, topIncoming, topExisting);
      if (issue) return issue;
    }
    if (def.type === "SUBTABLE" && def.fields) {
      const innerIncoming = new Set(Object.keys(def.fields));
      const innerExisting = collectExistingSubtableInnerCodes(existingArr, code);
      for (const inner of Object.values(def.fields)) {
        if (!inner.lookup) continue;
        const issue = checkMappings(inner.lookup.fieldMappings, innerIncoming, innerExisting);
        if (issue) return issue;
      }
    }
  }
  return null;
};

const checkMappings = (
  mappings: FieldMapping[] | undefined,
  incomingCodes: Set<string>,
  existingCodes: Set<string>,
): MissingFieldIssue | null => {
  for (const m of mappings ?? []) {
    if (!m.field) continue;
    if (!incomingCodes.has(m.field) && !existingCodes.has(m.field)) {
      return { missingField: m.field };
    }
  }
  return null;
};
