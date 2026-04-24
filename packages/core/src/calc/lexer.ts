// 計算式用のトークナイザ。
// 全角記号（＋ － ＊ ／ ＝ 等）はトークン段階で専用エラーに変換する。
// 実機が「全角記号「X」が入力されています」と deploy 時に返すため、同等のメッセージを保持したい。

import { CalcParseError } from "./errors";

export type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "eof" };

const IDENT_CHAR = /[\w々〆぀-ヿ一-鿿＀-￯]/;

const FULLWIDTH_OP: Record<string, string> = {
  "＋": "+", "－": "-", "＊": "*", "／": "/", "＾": "^",
  "＝": "=", "！": "!", "＜": "<", "＞": ">",
  "（": "(", "）": ")", "，": ",", "＆": "&",
};

const syntaxError = () => new CalcParseError("計算式の文法が正しくありません。", "syntax");

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const len = input.length;
  let i = 0;

  while (i < len) {
    const ch = input[i]!;

    if (/\s/.test(ch)) { i++; continue; }

    if (FULLWIDTH_OP[ch] !== undefined) {
      throw new CalcParseError(
        `全角記号「${ch}」が入力されています。半角記号「${FULLWIDTH_OP[ch]}」を入力してください。`,
        "fullwidth",
        { char: ch, expected: FULLWIDTH_OP[ch] },
      );
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let value = "";
      i++;
      while (i < len && input[i] !== quote) {
        const c = input[i]!;
        if (c === "\n" || c === "\r") throw syntaxError();
        if (c === "\\") {
          i++;
          if (i >= len) throw syntaxError();
          const esc = input[i]!;
          switch (esc) {
            case "n":  value += "\n"; break;
            case "r":  value += "\r"; break;
            case "t":  value += "\t"; break;
            case '"':  value += '"';  break;
            case "'":  value += "'";  break;
            case "\\": value += "\\"; break;
            default:   value += esc;  break;
          }
          i++;
        } else {
          value += c;
          i++;
        }
      }
      if (input[i] !== quote) throw syntaxError();
      i++;
      tokens.push({ type: "string", value });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(input[i + 1] ?? ""))) {
      const start = i;
      while (i < len && /[0-9]/.test(input[i]!)) i++;
      if (input[i] === ".") {
        i++;
        while (i < len && /[0-9]/.test(input[i]!)) i++;
      }
      tokens.push({ type: "number", value: Number(input.slice(start, i)) });
      continue;
    }

    if (ch === "!" && input[i + 1] === "=") { tokens.push({ type: "op", value: "!=" }); i += 2; continue; }
    if (ch === "<" && input[i + 1] === ">") { tokens.push({ type: "op", value: "!=" }); i += 2; continue; }
    if (ch === "<" && input[i + 1] === "=") { tokens.push({ type: "op", value: "<=" }); i += 2; continue; }
    if (ch === ">" && input[i + 1] === "=") { tokens.push({ type: "op", value: ">=" }); i += 2; continue; }

    if (ch === "=" && input[i + 1] === "=") {
      throw new CalcParseError(
        "「==」が入力されています。「=」を判定するには「=」を入力してください。",
        "bad_operator",
        { char: "==", expected: "=" },
      );
    }

    if ("+-*/^&=<>(),".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }

    if (IDENT_CHAR.test(ch)) {
      let value = "";
      while (i < len && IDENT_CHAR.test(input[i]!)) {
        value += input[i]!;
        i++;
      }
      const upper = value.toUpperCase();
      if (upper === "TRUE")  { tokens.push({ type: "bool", value: true }); continue; }
      if (upper === "FALSE") { tokens.push({ type: "bool", value: false }); continue; }
      tokens.push({ type: "ident", value });
      continue;
    }

    throw syntaxError();
  }
  tokens.push({ type: "eof" });
  return tokens;
}
