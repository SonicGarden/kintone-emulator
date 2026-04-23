import type { Condition, Expr, FieldRef, FnArg, OrderBy, Query, Value } from "./ast";
import type { Token } from "./lexer";
import { tokenize, TokenizeError } from "./lexer";

export class ParseError extends Error {}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  parseQuery(): Query {
    // 先頭の where 式（オプション: order by / limit / offset だけの場合もあり）
    let where: Expr | null = null;
    if (!this.atOption() && !this.isEOF()) {
      where = this.parseExpr();
    }

    const orderBy: OrderBy[] = [];
    let limit: number | null = null;
    let offset: number | null = null;

    // order by → limit → offset の順（仕様上）。実装上は順序固定で読む
    if (this.peekKw("order")) {
      this.consumeKw("order");
      this.consumeKw("by");
      orderBy.push(this.parseOrderByItem());
      while (this.peekOp(",")) {
        this.consumeOp(",");
        orderBy.push(this.parseOrderByItem());
      }
    }
    if (this.peekKw("limit")) {
      this.consumeKw("limit");
      limit = this.consumeNumber();
    }
    if (this.peekKw("offset")) {
      this.consumeKw("offset");
      offset = this.consumeNumber();
    }

    if (!this.isEOF()) {
      throw new ParseError(`unexpected trailing token: ${JSON.stringify(this.peek())}`);
    }
    return { where, orderBy, limit, offset };
  }

  private parseOrderByItem(): OrderBy {
    const field = this.parseFieldRef();
    let direction: "asc" | "desc" = "asc";
    if (this.peekKw("asc")) { this.consumeKw("asc"); direction = "asc"; }
    else if (this.peekKw("desc")) { this.consumeKw("desc"); direction = "desc"; }
    return { field, direction };
  }

  private parseExpr(): Expr {
    return this.parseOrExpr();
  }

  private parseOrExpr(): Expr {
    let left = this.parseAndExpr();
    while (this.peekKw("or")) {
      this.consumeKw("or");
      const right = this.parseAndExpr();
      left = { type: "or", left, right };
    }
    return left;
  }

  private parseAndExpr(): Expr {
    let left = this.parseAtom();
    while (this.peekKw("and")) {
      this.consumeKw("and");
      const right = this.parseAtom();
      left = { type: "and", left, right };
    }
    return left;
  }

  private parseAtom(): Expr {
    if (this.peekOp("(")) {
      this.consumeOp("(");
      const inner = this.parseExpr();
      this.consumeOp(")");
      return { type: "group", inner };
    }
    return this.parseCondition();
  }

  private parseCondition(): Condition {
    const field = this.parseFieldRef();
    const tok = this.peek();

    // is / is not
    if (tok.type === "keyword" && tok.value === "is") {
      this.next();
      let negate = false;
      if (this.peekKw("not")) { this.consumeKw("not"); negate = true; }
      this.consumeKw("empty");
      return { type: "is", field, negate, which: "empty" };
    }

    // not ... (not in / not like)
    if (tok.type === "keyword" && tok.value === "not") {
      this.next();
      if (this.peekKw("in")) {
        this.consumeKw("in");
        const values = this.parseInList();
        return { type: "in", field, negate: true, values };
      }
      if (this.peekKw("like")) {
        this.consumeKw("like");
        const value = this.parseValue();
        return { type: "like", field, negate: true, value };
      }
      throw new ParseError(`expected 'in' or 'like' after 'not'`);
    }

    // in
    if (tok.type === "keyword" && tok.value === "in") {
      this.next();
      const values = this.parseInList();
      return { type: "in", field, negate: false, values };
    }

    // like
    if (tok.type === "keyword" && tok.value === "like") {
      this.next();
      const value = this.parseValue();
      return { type: "like", field, negate: false, value };
    }

    // 比較演算子
    if (tok.type === "op" && ["=", "!=", "<", ">", "<=", ">="].includes(tok.value)) {
      this.next();
      const value = this.parseValue();
      return { type: "cmp", field, op: tok.value as Condition extends { op: infer O } ? O : never, value };
    }

    throw new ParseError(`expected operator after field, got ${JSON.stringify(tok)}`);
  }

  private parseInList(): Value[] {
    this.consumeOp("(");
    const values: Value[] = [];
    if (!this.peekOp(")")) {
      values.push(this.parseValue());
      while (this.peekOp(",")) {
        this.consumeOp(",");
        values.push(this.parseValue());
      }
    }
    this.consumeOp(")");
    return values;
  }

  private parseFieldRef(): FieldRef {
    const tok = this.next();
    if (tok.type !== "ident") {
      throw new ParseError(`expected field reference, got ${JSON.stringify(tok)}`);
    }
    if (tok.value === "$id") return { type: "id" };
    return { type: "field", code: tok.value };
  }

  private parseValue(): Value {
    const tok = this.peek();
    if (tok.type === "string") { this.next(); return { type: "string", value: tok.value }; }
    if (tok.type === "number") { this.next(); return { type: "number", value: tok.value }; }
    if (tok.type === "ident") {
      // 関数呼び出し 識別子 ( args )
      this.next();
      if (!this.peekOp("(")) {
        throw new ParseError(`bare identifier in value position: ${tok.value}`);
      }
      this.consumeOp("(");
      const args: FnArg[] = [];
      if (!this.peekOp(")")) {
        args.push(this.parseFnArg());
        while (this.peekOp(",")) {
          this.consumeOp(",");
          args.push(this.parseFnArg());
        }
      }
      this.consumeOp(")");
      return { type: "fn", name: tok.value, args };
    }
    throw new ParseError(`expected value, got ${JSON.stringify(tok)}`);
  }

  private parseFnArg(): FnArg {
    const tok = this.peek();
    if (tok.type === "string") { this.next(); return { type: "string", value: tok.value }; }
    if (tok.type === "number") { this.next(); return { type: "number", value: tok.value }; }
    if (tok.type === "ident") {
      this.next();
      return { type: "symbol", value: tok.value };
    }
    throw new ParseError(`expected function argument, got ${JSON.stringify(tok)}`);
  }

  // ---- token cursor ----

  private peek(offset = 0): Token { return this.tokens[this.i + offset]!; }
  private next(): Token { return this.tokens[this.i++]!; }
  private isEOF(): boolean { return this.peek().type === "eof"; }
  private atOption(): boolean {
    const t = this.peek();
    return t.type === "keyword" && (t.value === "order" || t.value === "limit" || t.value === "offset");
  }
  private peekKw(kw: string): boolean {
    const t = this.peek();
    return t.type === "keyword" && t.value === kw;
  }
  private consumeKw(kw: string): void {
    const t = this.peek();
    if (t.type !== "keyword" || t.value !== kw) {
      throw new ParseError(`expected keyword '${kw}', got ${JSON.stringify(t)}`);
    }
    this.next();
  }
  private peekOp(op: string): boolean {
    const t = this.peek();
    return t.type === "op" && t.value === op;
  }
  private consumeOp(op: string): void {
    const t = this.peek();
    if (t.type !== "op" || t.value !== op) {
      throw new ParseError(`expected '${op}', got ${JSON.stringify(t)}`);
    }
    this.next();
  }
  private consumeNumber(): number {
    const t = this.peek();
    if (t.type !== "number") {
      throw new ParseError(`expected number, got ${JSON.stringify(t)}`);
    }
    this.next();
    return t.value;
  }
}

export function parseQuery(input: string): Query {
  try {
    const tokens = tokenize(input);
    return new Parser(tokens).parseQuery();
  } catch (e) {
    if (e instanceof TokenizeError || e instanceof ParseError) throw e;
    throw new ParseError(String(e));
  }
}
