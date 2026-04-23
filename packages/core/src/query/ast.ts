// kintone クエリの AST 定義。
// 仕様: tmp/kintone-query.md / https://cybozu.dev/ja/kintone/docs/overview/query/

/** フィールド参照 */
export type FieldRef =
  | { type: "field"; code: string }
  // $id (レコード番号の省略記法)
  | { type: "id" };

/** 値リテラル or 関数呼び出し */
export type Value =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "fn"; name: string; args: FnArg[] };

/** 関数の引数。数値 / 文字列 / 記号型識別子（DAYS, LAST, SATURDAY 等） */
export type FnArg =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "symbol"; value: string };

/** 比較演算子 */
export type ComparisonOp = "=" | "!=" | "<" | ">" | "<=" | ">=";

/** 条件式 */
export type Condition =
  | { type: "cmp"; field: FieldRef; op: ComparisonOp; value: Value }
  | { type: "in"; field: FieldRef; negate: boolean; values: Value[] }
  | { type: "like"; field: FieldRef; negate: boolean; value: Value }
  | { type: "is"; field: FieldRef; negate: boolean; which: "empty" };

/** 論理式 */
export type Expr =
  | Condition
  | { type: "and"; left: Expr; right: Expr }
  | { type: "or"; left: Expr; right: Expr }
  | { type: "group"; inner: Expr };

/** 並び替え */
export type OrderBy = { field: FieldRef; direction: "asc" | "desc" };

/** クエリ全体 */
export type Query = {
  where: Expr | null;
  orderBy: OrderBy[];
  limit: number | null;
  offset: number | null;
};
