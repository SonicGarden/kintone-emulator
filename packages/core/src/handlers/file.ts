import crypto from "node:crypto";
import { dbSession } from "../db/client";
import { findFile, insertFile } from "../db/files";
import { attachmentContentDisposition } from "./content-disposition";
import {
  errorInvalidInput,
  errorInvalidRequest,
  errorInvalidUploadRequest,
  errorMessages,
  errorNotFoundFile,
} from "./errors";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

// WHATWG の multipart 直列化が filename に施すエスケープ（ブラウザや undici の FormData が行う）。
const WHATWG_FILENAME_ESCAPES: Record<string, string> = { '"': "%22", "\r": "%0D", "\n": "%0A" };

/**
 * アップロードされたファイル名を、実 kintone が保存するのと同じ形に正規化する。
 *
 * 1. パス成分を落とす。実機は `back\slash.txt` を `slash.txt`、`slash/.txt` を `.txt` として保存する
 *    （生の区切り文字のときだけ。`%5C` や `%2F` は文字列として残る）。区切り文字で終わる名前
 *    （`a/` など）では空文字列になり得るが、この形は実機で未確認
 * 2. WHATWG のエスケープを戻す。undici の multipart パーサーは仕様どおり `%22` / `%0D` / `%0A` を
 *    元の文字へ復元するが、実機 (Java) は復元せずエスケープされたまま保存する。
 *    そのままだとレコード取得の name が実機と食い違い、`"` を含む名前は Content-Disposition の
 *    quoted-string も壊す。パーサーが戻した分だけ入れ直して実機に揃える。
 */
export const normalizeUploadedFilename = (filename: string): string =>
  filename
    .split(/[\\/]/)
    .pop()!
    .replace(/["\r\n]/g, (char) => WHATWG_FILENAME_ESCAPES[char]!);

// アップロードキー: 実 kintone の一時保管領域キーに合わせて UUID 形式。
const generateUploadKey = () => crypto.randomUUID();
// ダウンロードキー: 実 kintone のレコード取得時キーに合わせた長い 16 進文字列。
const generateDownloadKey = () => crypto.randomBytes(24).toString("hex");

export const get = ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));
  const fileKey = new URL(request.url).searchParams.get('fileKey');
  if (!fileKey) {
    return errorInvalidInput({ fileKey: { messages: [errorMessages(locale).requiredField] } }, locale);
  }
  const file = findFile(dbSession(params.session), fileKey);
  if (!file) {
    return errorNotFoundFile(fileKey, locale);
  }

  const body = new Uint8Array(file.data.byteLength);
  body.set(file.data);
  return new Response(body, {
    headers: {
      'Content-Type': file.content_type,
      'Content-Disposition': attachmentContentDisposition(file.filename),
    },
  });
};

export const post = async ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    // multipart として読めないリクエストは実 kintone と同じ 400 GAIA_HM02 で弾く。
    // 素通しすると undici の TypeError がそのまま漏れて 500 になり、実機と食い違う。
    // Node クライアントでこれを踏むのは主にファイル名にダブルクォートが入ったとき
    // （form-data パッケージが `filename="..."` をエスケープせず組み立てるため）。
    //
    // この分岐は「壊れた multipart なら undici が必ず例外を投げる」ことに依存している。
    // 将来 undici が黙って部分的な FormData を返すようになると、GAIA_HM02 ではなく
    // 下の CB_IL02 に落ちる（500 にはならないので fail-closed 側には倒れる）。
    return errorInvalidUploadRequest(locale);
  }

  const file = formData.get('file');
  if (file === null || typeof file === 'string') {
    return errorInvalidRequest(locale);
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  const uploadKey = generateUploadKey();
  const downloadKey = generateDownloadKey();
  const inserted = insertFile(
    dbSession(params.session),
    normalizeUploadedFilename(file.name),
    buffer,
    file.type,
    uploadKey,
    downloadKey,
  );
  if (!inserted) {
    return Response.json({ message: 'Failed to upload file.' }, { status: 500 });
  }

  // 実 kintone と同様、アップロードAPIは一時保管領域のキー（upload_key）を返す。
  // レコードに添付すると download_key へ振り替えられ、レコード取得時はそちらが返る。
  return Response.json({ fileKey: uploadKey });
};
