// 計算式パーサー。実機の演算子優先度に従う:
//   単項 +- > ^ (右結合) > * / > + - > & > 比較

import type { CalcNode, BinaryOp } from "./ast";
import { CalcParseError } from "./errors";
import { tokenize, type Token } from "./lexer";

export { CalcParseError } from "./errors";

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token { return this.tokens[this.pos]!; }
  private eat(): Token { return this.tokens[this.pos++]!; }
  private expectOp(op: string): void {
    const t = this.peek();
    if (t.type !== "op" || t.value !== op) {
      throw new CalcParseError("計算式の文法が正しくありません。", "syntax");
    }
    this.pos++;
  }

  parseTopLevel(): CalcNode {
    const expr = this.parseComparison();
    if (this.peek().type !== "eof") {
      throw new CalcParseError("計算式の文法が正しくありません。", "syntax");
    }
    return expr;
  }

  // 比較（= != < <= > >=）：実機では比較の連鎖 (a<b<c) は許さないため非結合にしておく。
  private parseComparison(): CalcNode {
    let left = this.parseConcat();
    const t = this.peek();
    if (t.type === "op" && ["=", "!=", "<", "<=", ">", ">="].includes(t.value)) {
      this.eat();
      const right = this.parseConcat();
      left = { type: "binary", op: t.value as BinaryOp, left, right };
      // 二重比較は文法エラー
      const nxt = this.peek();
      if (nxt.type === "op" && ["=", "!=", "<", "<=", ">", ">="].includes(nxt.value)) {
        throw new CalcParseError("計算式の文法が正しくありません。", "syntax");
      }
    }
    return left;
  }

  // & 結合（左結合）
  private parseConcat(): CalcNode {
    let left = this.parseAdd();
    for (;;) {
      const t = this.peek();
      if (t.type !== "op" || t.value !== "&") break;
      this.eat();
      const right = this.parseAdd();
      left = { type: "binary", op: "&", left, right };
    }
    return left;
  }

  // + - （左結合）
  private parseAdd(): CalcNode {
    let left = this.parseMul();
    for (;;) {
      const t = this.peek();
      if (t.type !== "op" || (t.value !== "+" && t.value !== "-")) break;
      this.eat();
      const right = this.parseMul();
      left = { type: "binary", op: t.value as BinaryOp, left, right };
    }
    return left;
  }

  // * / （左結合）
  private parseMul(): CalcNode {
    let left = this.parsePow();
    for (;;) {
      const t = this.peek();
      if (t.type !== "op" || (t.value !== "*" && t.value !== "/")) break;
      this.eat();
      const right = this.parsePow();
      left = { type: "binary", op: t.value as BinaryOp, left, right };
    }
    return left;
  }

  // ^ （右結合）
  private parsePow(): CalcNode {
    const left = this.parseUnary();
    const t = this.peek();
    if (t.type === "op" && t.value === "^") {
      this.eat();
      const right = this.parsePow();
      return { type: "binary", op: "^", left, right };
    }
    return left;
  }

  // 単項 + -
  private parseUnary(): CalcNode {
    const t = this.peek();
    if (t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.eat();
      const expr = this.parseUnary();
      return { type: "unary", op: t.value as "+" | "-", expr };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): CalcNode {
    const t = this.peek();
    if (t.type === "number") { this.eat(); return { type: "number", value: t.value }; }
    if (t.type === "string") { this.eat(); return { type: "string", value: t.value }; }
    if (t.type === "bool")   { this.eat(); return { type: "bool",   value: t.value }; }
    if (t.type === "op" && t.value === "(") {
      this.eat();
      const expr = this.parseComparison();
      this.expectOp(")");
      return expr;
    }
    if (t.type === "ident") {
      this.eat();
      const nxt = this.peek();
      if (nxt.type === "op" && nxt.value === "(") {
        this.eat();
        const args: CalcNode[] = [];
        const closed = (): boolean => {
          const p = this.peek();
          return p.type === "op" && p.value === ")";
        };
        if (!closed()) {
          args.push(this.parseComparison());
          let p = this.peek();
          while (p.type === "op" && p.value === ",") {
            this.eat();
            args.push(this.parseComparison());
            p = this.peek();
          }
        }
        this.expectOp(")");
        return { type: "call", name: t.value, args };
      }
      return { type: "field", code: t.value };
    }
    throw new CalcParseError("計算式の文法が正しくありません。", "syntax");
  }
}

export const parseExpression = (input: string): CalcNode => {
  if (input.trim() === "") {
    throw new CalcParseError("計算式の文法が正しくありません。", "empty");
  }
  return new Parser(tokenize(input)).parseTopLevel();
};
