// 計算式のセマンティックバリデーション。
// 未定義フィールド / 未知の関数 / 引数数 / 参照不可タイプ / 循環参照を検出する。
// エラーは lexer / parser と共通の CalcParseError に統合してある。

import { collectFieldRefs, type CalcNode } from "./ast";
import { CalcParseError } from "./errors";
import { functionSpec } from "./functions";
import { parseExpression } from "./parser";

/** CALC フィールドの format として受け入れられる値（実機の enum） */
export const CALC_FORMAT_ENUM = [
  "NUMBER",
  "NUMBER_DIGIT",
  "DATETIME",
  "DATE",
  "TIME",
  "HOUR_MINUTE",
  "DAY_HOUR_MINUTE",
] as const;

/** 計算式から参照できるフィールドタイプ（実機ヘルプ準拠） */
const REFERENCEABLE_TYPES = new Set([
  "NUMBER",
  "CALC",
  "DATE",
  "TIME",
  "DATETIME",
  "CREATED_TIME",
  "UPDATED_TIME",
  "LOOKUP",
  "SINGLE_LINE_TEXT",
  "DROP_DOWN",
  "RADIO_BUTTON",
  "CHECK_BOX",
  "MULTI_SELECT",
  "CREATOR",
  "MODIFIER",
]);

// 参照不可タイプのエラーメッセージに入れる日本語表示
const TYPE_LABEL: Record<string, string> = {
  RECORD_NUMBER: "レコード番号",
  LABEL: "ラベル",
  MULTI_LINE_TEXT: "文字列（複数行）",
  RICH_TEXT: "リッチエディター",
  FILE: "添付ファイル",
  LINK: "リンク",
  USER_SELECT: "ユーザー選択",
  ORGANIZATION_SELECT: "組織選択",
  GROUP_SELECT: "グループ選択",
  REFERENCE_TABLE: "関連レコード一覧",
  SPACER: "スペース",
  HR: "罫線",
  GROUP: "グループ",
  STATUS: "ステータス",
  STATUS_ASSIGNEE: "作業者",
  CATEGORY: "カテゴリー",
};

export type FieldLike = {
  code: string;
  type: string;
  label?: string;
  fields?: Record<string, { code: string; type: string; label?: string }>;
  expression?: string;
};

export type FieldIndex = {
  byCode: Map<string, { type: string; label?: string; inSubtable?: boolean }>;
  top: Map<string, FieldLike>;
};

export const buildFieldIndex = (fields: Iterable<FieldLike>): FieldIndex => {
  const byCode = new Map<string, { type: string; label?: string; inSubtable?: boolean }>();
  const top = new Map<string, FieldLike>();
  for (const f of fields) {
    top.set(f.code, f);
    byCode.set(f.code, { type: f.type, label: f.label });
    if (f.type === "SUBTABLE" && f.fields) {
      for (const sub of Object.values(f.fields)) {
        byCode.set(sub.code, { type: sub.type, label: sub.label, inSubtable: true });
      }
    }
  }
  return { byCode, top };
};

/** 単一の式を構文解析 + 関数/引数数チェック。参照先フィールドのチェックは呼び出し側で index を渡す。*/
export const validateExpressionStructure = (expression: string): CalcNode => {
  const ast = parseExpression(expression);
  checkCalls(ast);
  return ast;
};

const checkCalls = (node: CalcNode): void => {
  if (node.type === "call") {
    const upper = node.name.toUpperCase();
    const spec = functionSpec(upper);
    if (!spec) {
      throw new CalcParseError(`${upper}関数は使用できません。`, "unknown_function", { name: upper });
    }
    if (spec.max !== undefined && node.args.length > spec.max) {
      throw new CalcParseError(
        `${upper}関数に指定できる引数は${spec.max}個までです。`,
        "arg_count_max",
        { name: upper, max: spec.max, got: node.args.length },
      );
    }
    if (node.args.length < spec.min) {
      const msg = spec.min === spec.max
        ? `${upper}関数には${spec.min}個の引数が必要です。`
        : `${upper}関数には${spec.min}個以上の引数が必要です。`;
      throw new CalcParseError(msg, "arg_count", { name: upper, min: spec.min, got: node.args.length });
    }
    for (const a of node.args) checkCalls(a);
    return;
  }
  if (node.type === "binary") { checkCalls(node.left); checkCalls(node.right); return; }
  if (node.type === "unary")  { checkCalls(node.expr); return; }
};

/** AST 内の全フィールド参照について、index に存在し・参照可能タイプであることをチェック */
export const validateExpressionReferences = (ast: CalcNode, index: FieldIndex): void => {
  for (const code of collectFieldRefs(ast)) {
    const f = index.byCode.get(code);
    if (!f) {
      throw new CalcParseError(
        `計算式に含まれるフィールドコード（${code}）が存在しません。`,
        "unknown_field",
        { code },
      );
    }
    // SUBTABLE 自体は参照不可。SUBTABLE 内のフィールドは SUM() 等の引数として使われる前提
    if (f.type === "SUBTABLE") {
      throw new CalcParseError(
        `計算式で利用できないフィールドタイプが指定されています。`,
        "non_referenceable_field",
        { code, fieldType: f.type },
      );
    }
    if (!REFERENCEABLE_TYPES.has(f.type) && !f.inSubtable) {
      throw new CalcParseError(
        `計算式で利用できないフィールドタイプ(${TYPE_LABEL[f.type] ?? f.type})が指定されています。`,
        "non_referenceable_field",
        { code, fieldType: f.type },
      );
    }
  }
};

export const validateCalcField = (field: FieldLike, index: FieldIndex): CalcNode => {
  const expr = (field.expression ?? "").trim();
  if (expr === "") {
    throw new CalcParseError("計算式の文法が正しくありません。", "empty");
  }
  const ast = validateExpressionStructure(expr);
  validateExpressionReferences(ast, index);
  return ast;
};

/** アプリ内の全 CALC / 文字列自動計算 expression について循環参照を検出する。 */
export const detectCircularReferences = (asts: Map<string, CalcNode>): void => {
  const graph = new Map<string, string[]>();
  for (const [code, ast] of asts) {
    graph.set(code, [...collectFieldRefs(ast)].filter((c) => asts.has(c)));
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const k of graph.keys()) color.set(k, WHITE);

  const visit = (node: string): string[] | null => {
    color.set(node, GRAY);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next);
      if (c === GRAY) return [node, next];
      if (c === WHITE) {
        const cyclePath = visit(next);
        if (cyclePath) return [node, ...cyclePath];
      }
    }
    color.set(node, BLACK);
    return null;
  };

  for (const k of graph.keys()) {
    if (color.get(k) !== WHITE) continue;
    const cycle = visit(k);
    if (cycle) {
      throw new CalcParseError("フィールドの参照が循環しています。", "circular", { cycle });
    }
  }
};
