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

/** SUBTABLE 内フィールドの情報。キーは内側のフィールドコード */
export type SubtableFieldMap = Record<string, { subtableCode: string; type: string }>;

export type CompileContext = {
  fieldTypes: FieldTypeMap;
  /** SUBTABLE 内フィールドの型マップ（内側フィールドコード → { subtableCode, type }） */
  subtableFields?: SubtableFieldMap;
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
type FieldExpr = { expr: string; wrap?: "datetime" | "date" };

/** NUMBER / CALC は TEXT で保存されているので REAL にキャストしないと SQLite が文字列比較で誤る */
const numericCast = (expr: string, type: string): string => {
  if (type === "NUMBER" || type === "CALC") return `CAST(${expr} AS REAL)`;
  return expr;
};

/** トップレベルフィールドの SQL 列式を生成 */
const topLevelFieldExpr = (field: FieldRef, fieldTypes: FieldTypeMap): FieldExpr => {
  if (field.type === "id") return { expr: "id" };
  const code = field.code;
  const type = fieldTypes[code];
  switch (type) {
    case "RECORD_NUMBER": return { expr: "id" };
    case "CREATED_TIME":  return { expr: "created_at", wrap: "datetime" };
    case "UPDATED_TIME":  return { expr: "updated_at", wrap: "datetime" };
    case "DATETIME":      return { expr: `body->>'$.${code}.value'`, wrap: "datetime" };
    case "DATE":          return { expr: `body->>'$.${code}.value'`, wrap: "date" };
    default:              return { expr: numericCast(`body->>'$.${code}.value'`, type ?? "") };
  }
};

/** SUBTABLE 内フィールドへの参照を EXISTS サブクエリで扱うときの、内側の列式 */
const subtableInnerExpr = (innerCode: string, type: string): FieldExpr => {
  const base = `sub.value->>'$.value.${innerCode}.value'`;
  switch (type) {
    case "DATETIME": return { expr: base, wrap: "datetime" };
    case "DATE":     return { expr: base, wrap: "date" };
    default:         return { expr: numericCast(base, type) };
  }
};

const wrapped = (r: { expr: string; wrap?: "datetime" | "date" }): string => {
  if (r.wrap === "datetime") return `datetime(${r.expr})`;
  if (r.wrap === "date") return `date(${r.expr})`;
  return r.expr;
};

type ResolvedField =
  | { location: "top"; type: string }
  | { location: "subtable"; subtableCode: string; type: string };

const resolveField = (field: FieldRef, ctx: CompileContext): ResolvedField => {
  if (field.type === "id") return { location: "top", type: "__ID__" };
  const top = ctx.fieldTypes[field.code];
  if (top) return { location: "top", type: top };
  const sub = ctx.subtableFields?.[field.code];
  if (sub) return { location: "subtable", subtableCode: sub.subtableCode, type: sub.type };
  throw new CompileError(
    `指定されたフィールド（${field.code}）が見つかりません。`,
    "GAIA_IQ11",
  );
};

/** 「否定」型の条件か（not in / not like / is not empty） */
const isNegativeCondition = (c: Condition): boolean => {
  return (c.type === "in" || c.type === "like" || c.type === "is") && c.negate;
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

/** 演算子とフィールドタイプの組み合わせを検証（実機 GAIA_IQ03 / GAIA_IQ07 準拠） */
const assertOperatorAllowed = (field: FieldRef, resolved: ResolvedField, op: string): void => {
  const label = field.type === "id" ? "$id" : field.code;
  // SUBTABLE 内フィールドに = / != は不可（GAIA_IQ07）
  if (resolved.location === "subtable" && (op === "=" || op === "!=")) {
    throw new CompileError(
      `テーブルに設定している場合、${label}フィールドのフィールドタイプには、演算子${op}を使用できません。`,
      "GAIA_IQ07",
    );
  }
  const allowed = ALLOWED_OPS[resolved.type];
  if (!allowed || !allowed.has(op)) {
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
    const resolved = resolveField(o.field, this.ctx);
    if (resolved.location === "subtable") {
      throw new CompileError(
        `テーブル内のフィールド（${(o.field as { code: string }).code}）を order by に指定することはできません。`,
        "GAIA_IQ03",
      );
    }
    const ref = topLevelFieldExpr(o.field, this.ctx.fieldTypes);
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
    const resolved = resolveField(c.field, this.ctx);
    const opLabel = conditionOp(c);
    assertOperatorAllowed(c.field, resolved, opLabel);

    if (resolved.location === "subtable") {
      return this.compileSubtableCondition(c, resolved);
    }

    const ref = topLevelFieldExpr(c.field, this.ctx.fieldTypes);
    return this.buildSimpleCondition(c, ref);
  }

  /** top-level フィールドに対する条件を SQL 式として生成 */
  private buildSimpleCondition(c: Condition, ref: FieldExpr): string {
    const col = wrapped(ref);
    switch (c.type) {
      case "cmp": {
        const { op, value } = c;
        const resolved = this.resolveValue(value, ref.wrap);
        if (resolved.kind === "range") {
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
        const ph = this.placeholder(`%${String(raw)}%`);
        return `${col} ${c.negate ? "NOT LIKE" : "LIKE"} ${ph}`;
      }
      case "is": {
        const emptyCond = `(${col} IS NULL OR trim(${col}) = '')`;
        return c.negate ? `NOT ${emptyCond}` : emptyCond;
      }
    }
  }

  /**
   * SUBTABLE 内フィールドに対する条件は、行単位の EXISTS / NOT EXISTS に変換する。
   * - positive (in / like / >, < 等 / is empty): EXISTS (いずれかの行が条件を満たす)
   * - negative (not in / not like / is not empty): NOT EXISTS (条件を満たす行が無い = 全行が not 条件を満たす)
   * これにより実機と同じ「少なくとも 1 行 / 全行」のセマンティクスになる。
   */
  private compileSubtableCondition(
    c: Condition,
    resolved: { location: "subtable"; subtableCode: string; type: string },
  ): string {
    const innerCode = (c.field as { code: string }).code;
    const ref = subtableInnerExpr(innerCode, resolved.type);
    // 常に positive 側の条件を生成して、negative フラグに応じて NOT EXISTS でラップする
    const positiveCondition = { ...c, negate: false } as Condition;
    const innerSql = this.buildSimpleCondition(positiveCondition, ref);
    const enumerator = `json_each(body, '$.${resolved.subtableCode}.value')`;
    const existsClause = `EXISTS (SELECT 1 FROM ${enumerator} AS sub WHERE ${innerSql})`;
    const negate = isNegativeCondition(c);
    if (!negate) return existsClause;
    // negative は「1 行もマッチしない」ではなく「行があり、どの行もマッチしない」。
    // 空配列のレコードは返さないのが実 kintone の挙動
    const hasRows = `EXISTS (SELECT 1 FROM ${enumerator} AS sub)`;
    return `(${hasRows} AND NOT ${existsClause})`;
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
