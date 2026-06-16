// kintone クエリのトークナイザ。
// 許容する識別子文字: ASCII \w + ひらがな / カタカナ / 基本 CJK 漢字 / 「々」「〆」 / 全角英数字・記号
// 文字列リテラル: "..." （\\ と \" をエスケープ）

export type Token =
  | { type: "ident"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "keyword"; value: string }
  | { type: "op"; value: string }
  | { type: "eof" };

const KEYWORDS = new Set([
  "and", "or", "in", "not", "like", "is", "empty",
  "order", "by", "asc", "desc", "limit", "offset",
]);

// 識別子として許容する文字（RegExp として定数）
// 々-〆: 々〆  ぀-ヿ: ひらがな+カタカナ  一-鿿: 基本 CJK 漢字  ＀-￯: 全角英数字・記号
const IDENT_CHAR = /[\w々〆぀-ヿ一-鿿＀-￯]/;

export class TokenizeError extends Error {}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const len = input.length;
  let i = 0;
  while (i < len) {
    const ch = input[i]!;

    // 空白
    if (/\s/.test(ch)) { i++; continue; }

    // 文字列リテラル（kintone 仕様は " のみだが、互換性のため ' も許容）。
    // 実 kintone の挙動に合わせて:
    //   - 生のタブ / 改行 / CR を文字列内に含めるとエラー
    //   - \t / \n / \r はそれぞれ対応する制御文字に展開
    //   - \" / \\ / \' はクォートやバックスラッシュに展開
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let value = "";
      i++;
      while (i < len && input[i] !== quote) {
        const c = input[i]!;
        if (c === "\t" || c === "\n" || c === "\r") {
          throw new TokenizeError(
            "raw control character (tab/newline/CR) not allowed inside string literal; use \\t, \\n, \\r",
          );
        }
        if (c === "\\") {
          i++;
          if (i >= len) throw new TokenizeError("unterminated escape in string literal");
          const esc = input[i]!;
          switch (esc) {
            case "t":  value += "\t"; break;
            case "n":  value += "\n"; break;
            case "r":  value += "\r"; break;
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
      if (input[i] !== quote) throw new TokenizeError("unterminated string literal");
      i++;
      tokens.push({ type: "string", value });
      continue;
    }

    // 数値リテラル（整数 / 小数）。kintone のクエリで単項マイナスは出ないが、値として - 付きも一応許容
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      const start = i;
      if (ch === "-") i++;
      while (i < len && /[0-9]/.test(input[i]!)) i++;
      if (input[i] === ".") {
        i++;
        while (i < len && /[0-9]/.test(input[i]!)) i++;
      }
      tokens.push({ type: "number", value: Number(input.slice(start, i)) });
      continue;
    }

    // 2 文字演算子
    if (ch === "!" && input[i + 1] === "=") { tokens.push({ type: "op", value: "!=" }); i += 2; continue; }
    if (ch === "<" && input[i + 1] === "=") { tokens.push({ type: "op", value: "<=" }); i += 2; continue; }
    if (ch === ">" && input[i + 1] === "=") { tokens.push({ type: "op", value: ">=" }); i += 2; continue; }

    // 1 文字演算子・区切り
    if ("=<>(),.".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }

    // $id 等の $ プレフィックス識別子
    if (ch === "$") {
      let value = "$";
      i++;
      while (i < len && IDENT_CHAR.test(input[i]!)) {
        value += input[i]!;
        i++;
      }
      tokens.push({ type: "ident", value });
      continue;
    }

    // 識別子 / キーワード
    if (IDENT_CHAR.test(ch)) {
      let value = "";
      while (i < len && IDENT_CHAR.test(input[i]!)) {
        value += input[i]!;
        i++;
      }
      const lower = value.toLowerCase();
      if (KEYWORDS.has(lower)) tokens.push({ type: "keyword", value: lower });
      else tokens.push({ type: "ident", value });
      continue;
    }

    throw new TokenizeError(`unexpected character: ${JSON.stringify(ch)}`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}
