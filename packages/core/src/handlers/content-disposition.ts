// 添付ファイルダウンロードの Content-Disposition を実 kintone と同じ書式で組み立てる。
//
// 実 kintone (2026-08 時点で実機確認) の挙動:
//   - ASCII のみのファイル名 … `attachment; filename="space name.txt"` とそのまま入れる
//     （空白・シングルクォート・セミコロンもエスケープしない）
//   - 非 ASCII を含むファイル名 … 名前全体を RFC 2047 の encoded-word (B encoding / UTF-8) にする
//     例: `attachment; filename="=?UTF-8?B?44OG44K544OILnR4dA==?="`
//
// Why not ダブルクォートをエスケープする: quoted-string を壊し得るのはダブルクォートだけだが、
// 生のダブルクォートを含むファイル名はそもそも保存され得ない。WHATWG 準拠のクライアント
// （ブラウザ / undici の FormData）は multipart の `filename="..."` を組み立てる際にダブルクォートを
// `%22` へ逃がすのでサーバーには届かず、逃がさないクライアント（form-data パッケージ = Node の
// @kintone/rest-api-client）が送る multipart は壊れていて、アップロードが 400 GAIA_HM02 で弾かれる。
// エスケープを足すと「実機では起こり得ない入力」への対処がコードに残るだけになる。
//
// Why not RFC 5987 (`filename*=UTF-8''...`): そちらが HTTP 的には現代的な書式だが、
// 実 kintone は encoded-word を返す。エミュレーターが標準寄りの書式を返すと、
// ヘッダーをパースする利用側コードが「エミュレーターでは通るのに実 kintone で壊れる」
// という取りこぼし方をする。忠実さを優先して実機に合わせる。

const MIME_CHARSET = "UTF-8";
const ENCODED_WORD_PREFIX = `=?${MIME_CHARSET}?B?`;
const ENCODED_WORD_SUFFIX = "?=";

// RFC 2047 は encoded-word 全体を 75 バイト以内に収めるよう求める。実 kintone (JavaMail の
// MimeUtility.encodeWord) と同じく、75 から区切り記号 7 バイト (`=?` `?` `?` `?=` と encoding 1 文字)
// と charset 名の長さを引いた残りを base64 出力に使える枠とする。
const AVAILABLE_BASE64_LENGTH = 75 - 7 - MIME_CHARSET.length;

/**
 * そのままヘッダー値に置ける文字だけで構成されているか。
 *
 * Why not「非 ASCII のみを encoded-word にする」: 制御文字 (CR/LF など) は Latin-1 の範囲なので
 * ByteString エラーにはならないが、ヘッダー値に混ぜると Response 生成が別の理由で落ちる。
 * 実 kintone はそもそもそんなファイル名を受け付けないため忠実さは損なわれず、fail-closed に倒せる。
 */
const isPrintableAscii = (text: string) =>
  [...text].every((char) => char >= " " && char <= "~");

/** パディング込みの base64 出力長 */
const base64Length = (byteLength: number) => Math.ceil(byteLength / 3) * 4;

const encodeWord = (bytes: Buffer) =>
  `${ENCODED_WORD_PREFIX}${bytes.toString("base64")}${ENCODED_WORD_SUFFIX}`;

/**
 * 枠に収まらなければ文字列を半分ずつに割って再帰する（JavaMail の doEncode と同じ分割）。
 * 「枠いっぱいまで詰めてから折る」のではなく毎回半分にするので、末尾の encoded-word だけが
 * 他より長くなることがある。実機の出力もそうなっているため、この分割方法自体を合わせている。
 *
 * Why not UTF-16 コード単位で割る: JavaMail は substring で割るためサロゲートペアを分断し得るが、
 * 分断すると両側が単独サロゲートになって文字化けする。ここではコードポイント単位で割る。
 * BMP 内の文字（日本語を含む通常のファイル名）では両者の分割位置は一致する。
 */
const pushEncodedWords = (text: string, out: string[]): void => {
  const bytes = Buffer.from(text, "utf8");
  const codePoints = Array.from(text);
  if (base64Length(bytes.byteLength) <= AVAILABLE_BASE64_LENGTH || codePoints.length <= 1) {
    out.push(encodeWord(bytes));
    return;
  }
  const half = codePoints.length >> 1;
  pushEncodedWords(codePoints.slice(0, half).join(""), out);
  pushEncodedWords(codePoints.slice(half).join(""), out);
};

/**
 * 添付ファイルダウンロード用の Content-Disposition ヘッダー値を返す。
 *
 * 不変条件: 戻り値は printable ASCII だけからなり、どんなファイル名でもそのままヘッダー値に置ける。
 * HTTP ヘッダーは ByteString しか持てないため、ファイル名を素通しすると Response の生成時点で
 * TypeError になり、ルーターの catch が 500 を返してしまう。
 */
export const attachmentContentDisposition = (filename: string): string => {
  if (isPrintableAscii(filename)) return `attachment; filename="${filename}"`;

  const words: string[] = [];
  pushEncodedWords(filename, words);
  // 実機は encoded-word 間を折り返し (CRLF + SP) で区切るが、HTTP ヘッダー値に CRLF は入れられない。
  // RFC 2047 上どちらも linear-white-space 区切りとして等価で、クライアントから見た値も同じになる。
  return `attachment; filename="${words.join(" ")}"`;
};
