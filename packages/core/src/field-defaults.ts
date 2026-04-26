// 各フィールドタイプのデフォルト属性。
// addFormFields で省略された optional 属性は、実機 getFormFields では空文字列や
// false など型ごとの規定値で埋められて返る。エミュレーターでもこれを再現する。
//
// 観察ベース（kintone-emulator-dev-1 / 2026-04-26）。

type FieldDef = Record<string, unknown> & { type?: string; code?: string };

const COMMON: Record<string, unknown> = { noLabel: false, required: false };

const TYPE_DEFAULTS: Record<string, Record<string, unknown>> = {
  SINGLE_LINE_TEXT:    { minLength: "", maxLength: "", expression: "", hideExpression: false, unique: false, defaultValue: "" },
  MULTI_LINE_TEXT:     { defaultValue: "" },
  RICH_TEXT:           { defaultValue: "" },
  NUMBER:              { minValue: "", maxValue: "", digit: false, unique: false, defaultValue: "", displayScale: "", unit: "", unitPosition: "BEFORE" },
  CALC:                { format: "NUMBER", displayScale: "", hideExpression: false, unit: "", unitPosition: "BEFORE" },
  DATE:                { unique: false, defaultValue: "", defaultNowValue: false },
  DATETIME:            { unique: false, defaultValue: "", defaultNowValue: false },
  TIME:                { defaultValue: "", defaultNowValue: false },
  LINK:                { protocol: "WEB", minLength: "", maxLength: "", unique: false, defaultValue: "" },
  FILE:                { thumbnailSize: "50" },
  DROP_DOWN:           { defaultValue: "" },
  // RADIO_BUTTON は実機で required=true がデフォルト。defaultValue は最初の option キー
  RADIO_BUTTON:        { align: "HORIZONTAL" },
  CHECK_BOX:           { defaultValue: [], align: "HORIZONTAL" },
  MULTI_SELECT:        { defaultValue: [] },
  USER_SELECT:         { entities: [], defaultValue: [] },
  ORGANIZATION_SELECT: { entities: [], defaultValue: [] },
  GROUP_SELECT:        { entities: [], defaultValue: [] },
};

// SUBTABLE は noLabel のみ持ち、required は持たない（実機準拠）
const NO_REQUIRED_TYPES = new Set(["SUBTABLE"]);

const firstOptionKey = (def: FieldDef): string | undefined => {
  const opts = def.options as Record<string, { label?: string; index?: string }> | undefined;
  if (!opts) return undefined;
  const entries = Object.entries(opts);
  if (entries.length === 0) return undefined;
  // index 順で並べる（Object.entries の順は元の挿入順）
  entries.sort(([, a], [, b]) => Number(a.index ?? 0) - Number(b.index ?? 0));
  return entries[0]?.[0];
};

/**
 * フィールド定義に type 別のデフォルト属性を補完して返す（破壊的でない）。
 * SUBTABLE 内の inner field も再帰的に補完する。
 */
export const applyFieldDefaults = (def: FieldDef): FieldDef => {
  const type = String(def.type ?? "");
  const out: FieldDef = { ...def };

  // SUBTABLE は noLabel のみ追加し、内部 fields を再帰的に補完
  if (type === "SUBTABLE") {
    if (!("noLabel" in out)) out.noLabel = false;
    const fields = out.fields as Record<string, FieldDef> | undefined;
    if (fields) {
      const filled: Record<string, FieldDef> = {};
      for (const [code, inner] of Object.entries(fields)) {
        filled[code] = applyFieldDefaults({ ...inner, code });
      }
      out.fields = filled;
    }
    return out;
  }

  // 共通デフォルト（required を持たないタイプは required を入れない）
  for (const [k, v] of Object.entries(COMMON)) {
    if (k === "required" && NO_REQUIRED_TYPES.has(type)) continue;
    if (!(k in out)) out[k] = v;
  }

  // RADIO_BUTTON は required: true がデフォルト（共通の required: false より優先）
  if (type === "RADIO_BUTTON" && !("required" in def)) {
    out.required = true;
  }

  // 型別デフォルト
  const typeDef = TYPE_DEFAULTS[type];
  if (typeDef) {
    for (const [k, v] of Object.entries(typeDef)) {
      if (!(k in out)) out[k] = v;
    }
  }

  // RADIO_BUTTON の defaultValue は options の最初のキー
  if (type === "RADIO_BUTTON" && !("defaultValue" in def)) {
    out.defaultValue = firstOptionKey(def) ?? "";
  }

  return out;
};

/**
 * テストコードでフィールド定義を作るヘルパー。
 * 必要最小限のフィールドコード + 型 + optional 属性を渡し、
 * type ごとのデフォルトを補完した完全なフィールド定義を返す。
 *
 * @example
 *   field("title", "SINGLE_LINE_TEXT")
 *   field("qty",   "NUMBER",       { required: true, maxValue: "100" })
 *   field("color", "RADIO_BUTTON", { options: { red: { label: "Red", index: "0" } } })
 */
export const field = (
  code: string,
  type: string,
  attrs?: Record<string, unknown>,
): FieldDef => {
  return applyFieldDefaults({ code, type, label: code, ...attrs });
};
