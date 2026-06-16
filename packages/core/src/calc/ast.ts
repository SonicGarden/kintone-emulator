// kintone 計算式の AST。

export type CalcNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "field"; code: string }
  | { type: "unary"; op: "+" | "-"; expr: CalcNode }
  | { type: "binary"; op: BinaryOp; left: CalcNode; right: CalcNode }
  | { type: "call"; name: string; args: CalcNode[] };

export type BinaryOp =
  | "+" | "-" | "*" | "/" | "^"
  | "&"
  | "=" | "!=" | "<" | "<=" | ">" | ">=";

/** AST を走査してフィールドコードを収集（重複除去） */
export const collectFieldRefs = (node: CalcNode, out: Set<string> = new Set()): Set<string> => {
  switch (node.type) {
    case "field": out.add(node.code); break;
    case "unary": collectFieldRefs(node.expr, out); break;
    case "binary":
      collectFieldRefs(node.left, out);
      collectFieldRefs(node.right, out);
      break;
    case "call":
      for (const a of node.args) collectFieldRefs(a, out);
      break;
  }
  return out;
};
