// フィールド追加時に走らせるバリデーション統合層。
// - CALC の format enum チェック（CB_VA01 相当のエラー情報）
// - CALC / 文字列自動計算の式バリデーション + 循環参照チェック（GAIA_IL01 相当）
//
// 返り値: 問題があれば { kind, ... } を返す。OK なら null。呼び出し側が
// Response に変換する（エラーレスポンスは handlers/errors.ts ですでに用意されている）。

import type { FieldProperties } from "../db/fields";
import type { CalcNode } from "./ast";
import { CalcParseError } from "./errors";
import {
  buildFieldIndex,
  CALC_FORMAT_ENUM,
  detectCircularReferences,
  validateCalcField,
  type FieldLike,
} from "./validate";

export type FieldValidationIssue =
  | {
      kind: "format_enum";
      /** エラーキー（"properties[<code>].format"） */
      key: string;
    }
  | {
      kind: "expression";
      fieldCode: string;
      fieldLabel: string;
      /** 実機エラーの「(エラーの内容：...)」の中に入る文言 */
      detailMessage: string;
    };

// 既存の DB に登録済みのフィールド群 + 新規追加する properties を合わせて FieldLike に変換。
const toFieldLikes = (
  existing: Iterable<{ code: string; body: string }>,
  incoming: FieldProperties,
): Map<string, FieldLike> => {
  const map = new Map<string, FieldLike>();
  for (const row of existing) {
    const parsed = JSON.parse(row.body) as FieldLike;
    map.set(row.code, { ...parsed, code: row.code });
  }
  for (const [code, def] of Object.entries(incoming)) {
    map.set(code, { ...(def as FieldLike), code });
  }
  return map;
};

/**
 * 1) CALC の format が enum に入っているか（入っていなければ即エラー）
 * 2) 新規追加 CALC / 文字列 autoCalc について expression の構文 + 参照チェック
 * 3) 既存 + 新規全体で循環参照検出
 */
export const validateFieldsForInsert = (
  existing: Iterable<{ code: string; body: string }>,
  incoming: FieldProperties,
): FieldValidationIssue | null => {
  // --- (1) format enum ---
  for (const [code, def] of Object.entries(incoming)) {
    const d = def as { type?: string; format?: string };
    if (d.type !== "CALC") continue;
    if (d.format != null && d.format !== "" && !CALC_FORMAT_ENUM.includes(d.format as never)) {
      return { kind: "format_enum", key: `properties[${code}].format` };
    }
  }

  const all = toFieldLikes(existing, incoming);
  const index = buildFieldIndex(all.values());

  // --- (2) 式バリデーション（新規追加分のみ対象）---
  const astMap = new Map<string, CalcNode>();

  // 既存 CALC / SINGLE_LINE_TEXT の expression も循環検出のため AST 化しておく
  for (const f of all.values()) {
    if (!hasExpression(f)) continue;
    try {
      const ast = validateCalcField(f, index);
      astMap.set(f.code, ast);
    } catch (e) {
      if (e instanceof CalcParseError) {
        // 既存フィールドのエラーは新規 insert 時には再掲しない（既に入っている = 検証済みのはず）
        // ただし新規フィールドがエラーを起こしている場合は返す
        if (incoming[f.code] !== undefined) {
          return {
            kind: "expression",
            fieldCode: f.code,
            fieldLabel: f.label ?? f.code,
            detailMessage: e.message,
          };
        }
        // 既存 field が何らかの理由でエラーの場合はスキップ
        continue;
      }
      throw e;
    }
  }

  // --- (3) 循環参照 ---
  try {
    detectCircularReferences(astMap);
  } catch (e) {
    if (e instanceof CalcParseError && e.kind === "circular") {
      // 循環に関与する最初の incoming フィールドをエラー主に据える（実機は deploy 時にひとつ挙げる）
      const cycle = (e.detail?.cycle as string[]) ?? [];
      const blame = cycle.find((c) => incoming[c] !== undefined) ?? Object.keys(incoming)[0] ?? "";
      const label = (incoming[blame] as { label?: string })?.label ?? blame;
      return {
        kind: "expression",
        fieldCode: blame,
        fieldLabel: label,
        detailMessage: e.message,
      };
    }
    throw e;
  }

  return null;
};

const hasExpression = (f: FieldLike): boolean => {
  if (f.type !== "CALC" && f.type !== "SINGLE_LINE_TEXT") return false;
  const expr = (f.expression ?? "").trim();
  return expr !== "";
};
