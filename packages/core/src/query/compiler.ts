// AST を SQLite の WHERE 句 + ORDER BY + LIMIT + OFFSET に変換する。
// フィールド参照はフィールド型に応じて `id` / `created_at` / `updated_at` / `body->>'$.<code>.value'` に分岐。

import type { Condition, Expr, FieldRef, OrderBy, Query, Value } from "./ast";
import type { ExpandContext } from "./functions";
import { evalFunction } from "./functions";

// クエリでサポートされる演算子のセット
export class CompileError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/** フィールドタイプごとに使用可能な演算子の許可リスト */
const ALLOWED_OPS: Record<string, Set<string>> = {
  RECORD_NUMBER:       new Set(["=", "!=", "<", ">", "<=", ">=", "in", "not in"]),
  __ID__:              new Set(["=", "!=", "<", ">", "<=", ">=", "in", "not in"]),
  CREATOR:             new Set(["in", "not in"]),
  CREATED_TIME:        new Set(["=", "!=", "<", ">", "<=", ">="]),
  MODIFIER:            new Set(["in", "not in"]),
  UPDATED_TIME:        new Set(["=", "!=", "<", ">", "<=", ">="]),
  SINGLE_LINE_TEXT:    new Set(["=", "!=", "in", "not in", "like", "not like"]),
  LINK:                new Set(["=", "!=", "in", "not in", "like", "not like"]),
  NUMBER:              new Set(["=", "!=", "<", ">", "<=", ">=", "in", "not in"]),
  CALC:                new Set(["=", "!=", "<", ">", "<=", ">=", "in", "not in"]),
  MULTI_LINE_TEXT:     new Set(["like", "not like", "is", "is not"]),
  RICH_TEXT:           new Set(["like", "not like"]),
  CHECK_BOX:           new Set(["in", "not in"]),
  RADIO_BUTTON:        new Set(["in", "not in"]),
  DROP_DOWN:           new Set(["in", "not in"]),
  MULTI_SELECT:        new Set(["in", "not in"]),
  FILE:                new Set(["like", "not like", "is", "is not"]),
  DATE:                new Set(["=", "!=", "<", ">", "<=", ">="]),
  TIME:                new Set(["=", "!=", "<", ">", "<=", ">="]),
  DATETIME:            new Set(["=", "!=", "<", ">", "<=", ">="]),
  USER_SELECT:         new Set(["in", "not in"]),
  ORGANIZATION_SELECT: new Set(["in", "not in"]),
  GROUP_SELECT:        new Set(["in", "not in"]),
  STATUS:              new Set(["=", "!=", "in", "not in"]),
};

export type FieldTypeMap = Record<string, string>;

export type CompileContext = {
  fieldTypes: FieldTypeMap;
  expandCtx?: ExpandContext;
};

export type Compiled = {
  /** SQLite 用の WHERE 句。null なら WHERE なし */
  where: string | null;
  /** ORDER BY 句（"col ASC, col2 DESC" 形式）。空なら ORDER BY なし */
  orderBy: string;
  /** LIMIT（数値）または null */
  limit: number | null;
  /** OFFSET（数値）または null */
  offset: number | null;
  /** プリペアドパラメータ */
  params: (string | number)[];
};

/**
 * フィールド参照を SQL の列式に変換する。
 * 比較対象の値の型（日付系かどうか）に応じて datetime() でラップするかを決める。
 */
const compileFieldRef = (field: FieldRef, fieldTypes: FieldTypeMap): { expr: string; wrap?: "datetime" | "date" } => {
  if (field.type === "id") return { expr: "id" };
  const code = field.code;
  const type = fieldTypes[code];
  switch (type) {
    case "RECORD_NUMBER":
      return { expr: "id" };
    case "CREATED_TIME":
      return { expr: "created_at", wrap: "datetime" };
    case "UPDATED_TIME":
      return { expr: "updated_at", wrap: "datetime" };
    case "DATETIME":
      return { expr: `body->>'$.${code}.value'`, wrap: "datetime" };
    case "DATE":
      return { expr: `body->>'$.${code}.value'`, wrap: "date" };
    default:
      return { expr: `body->>'$.${code}.value'` };
  }
};

const wrapped = (r: { expr: string; wrap?: "datetime" | "date" }): string => {
  if (r.wrap === "datetime") return `datetime(${r.expr})`;
  if (r.wrap === "date") return `date(${r.expr})`;
  return r.expr;
};

const resolveFieldType = (field: FieldRef, fieldTypes: FieldTypeMap): string => {
  if (field.type === "id") return "__ID__";
  const type = fieldTypes[field.code];
  if (!type) {
    throw new CompileError(
      `指定されたフィールド（${field.code}）が見つかりません。`,
      "GAIA_IQ11",
    );
  }
  return type;
};

/** Condition から「実機の表記で言う演算子名」を取り出す */
const conditionOp = (c: Condition): string => {
  switch (c.type) {
    case "cmp":  return c.op;
    case "in":   return c.negate ? "not in" : "in";
    case "like": return c.negate ? "not like" : "like";
    case "is":   return c.negate ? "is not" : "is";
  }
};

/** 演算子とフィールドタイプの組み合わせを検証（実機 GAIA_IQ03 準拠） */
const assertOperatorAllowed = (field: FieldRef, fieldTypes: FieldTypeMap, op: string): void => {
  const type = resolveFieldType(field, fieldTypes);
  const allowed = ALLOWED_OPS[type];
  if (!allowed || !allowed.has(op)) {
    const label = field.type === "id" ? "$id" : field.code;
    throw new CompileError(
      `${label}フィールドのフィールドタイプには演算子${op}を使用できません。`,
      "GAIA_IQ03",
    );
  }
};

class Compiler {
  private params: (string | number)[] = [];

  constructor(private readonly ctx: CompileContext) {}

  /** プリペアドプレースホルダ ? を追加し、対応する値を params に push */
  private placeholder(v: string | number): string {
    this.params.push(v);
    return "?";
  }

  compileQuery(q: Query): Compiled {
    const where = q.where ? this.compileExpr(q.where) : null;
    const orderByParts: string[] = q.orderBy.map((o) => this.compileOrderBy(o));
    // 実 kintone は order by 省略時 $id の降順
    const orderBy = orderByParts.length > 0 ? orderByParts.join(", ") : "id DESC";
    return {
      where,
      orderBy,
      limit: q.limit,
      offset: q.offset,
      params: this.params,
    };
  }

  private compileOrderBy(o: OrderBy): string {
    const ref = compileFieldRef(o.field, this.ctx.fieldTypes);
    return `${wrapped(ref)} ${o.direction.toUpperCase()}`;
  }

  private compileExpr(e: Expr): string {
    switch (e.type) {
      case "and":
        return `(${this.compileExpr(e.left)}) AND (${this.compileExpr(e.right)})`;
      case "or":
        return `(${this.compileExpr(e.left)}) OR (${this.compileExpr(e.right)})`;
      case "group":
        return this.compileExpr(e.inner);
      default:
        return this.compileCondition(e as Condition);
    }
  }

  private compileCondition(c: Condition): string {
    // 演算子とフィールドタイプの整合チェック（実機準拠）
    const opLabel = conditionOp(c);
    assertOperatorAllowed(c.field, this.ctx.fieldTypes, opLabel);

    const ref = compileFieldRef(c.field, this.ctx.fieldTypes);
    const col = wrapped(ref);

    switch (c.type) {
      case "cmp": {
        const { op, value } = c;
        const resolved = this.resolveValue(value, ref.wrap);
        if (resolved.kind === "range") {
          // = / != に対して範囲を展開する。他の比較演算子は範囲の端を使う。
          if (op === "=") {
            const startPh = this.placeholder(resolved.start);
            const endPh = this.placeholder(resolved.end);
            return `${col} BETWEEN ${this.wrapLiteral(startPh, ref.wrap)} AND ${this.wrapLiteral(endPh, ref.wrap)}`;
          }
          if (op === "!=") {
            const startPh = this.placeholder(resolved.start);
            const endPh = this.placeholder(resolved.end);
            return `${col} NOT BETWEEN ${this.wrapLiteral(startPh, ref.wrap)} AND ${this.wrapLiteral(endPh, ref.wrap)}`;
          }
          // <, <=, >, >= は端点を使う
          const boundary = (op === "<" || op === "<=") ? resolved.start : resolved.end;
          const ph = this.placeholder(boundary);
          return `${col} ${op} ${this.wrapLiteral(ph, ref.wrap)}`;
        }
        const ph = this.placeholder(resolved.literal);
        return `${col} ${op} ${this.wrapLiteral(ph, ref.wrap)}`;
      }
      case "in": {
        const placeholders = c.values.map((v) => {
          const r = this.resolveValue(v, ref.wrap);
          const lit = r.kind === "range" ? r.start : r.literal;
          const ph = this.placeholder(lit);
          return this.wrapLiteral(ph, ref.wrap);
        });
        const list = placeholders.join(", ");
        return `${col} ${c.negate ? "NOT IN" : "IN"} (${list})`;
      }
      case "like": {
        const resolved = this.resolveValue(c.value, undefined);
        const raw = resolved.kind === "range" ? resolved.start : resolved.literal;
        // kintone は単語検索だが SQLite には相当機能が無いので部分一致で代用
        const ph = this.placeholder(`%${String(raw)}%`);
        return `${col} ${c.negate ? "NOT LIKE" : "LIKE"} ${ph}`;
      }
      case "is": {
        // is empty / is not empty
        // 空 = NULL or 空文字 or 空白文字のみ
        const emptyCond = `(${col} IS NULL OR trim(${col}) = '')`;
        return c.negate ? `NOT ${emptyCond}` : emptyCond;
      }
    }
  }

  private wrapLiteral(placeholder: string, wrap?: "datetime" | "date"): string {
    if (wrap === "datetime") return `datetime(${placeholder})`;
    if (wrap === "date") return `date(${placeholder})`;
    return placeholder;
  }

  private resolveValue(
    v: Value,
    wrap: "datetime" | "date" | undefined,
  ): { kind: "literal"; literal: string | number } | { kind: "range"; start: string; end: string } {
    if (v.type === "string") return { kind: "literal", literal: v.value };
    if (v.type === "number") return { kind: "literal", literal: v.value };
    // function
    const r = evalFunction(v.name, v.args, this.ctx.expandCtx);
    if (r.kind === "value") return { kind: "literal", literal: r.value };
    // range
    if (wrap === "date") {
      return { kind: "range", start: r.start.slice(0, 10), end: r.end.slice(0, 10) };
    }
    return { kind: "range", start: r.start, end: r.end };
  }
}

export const compile = (q: Query, ctx: CompileContext): Compiled => {
  return new Compiler(ctx).compileQuery(q);
};
