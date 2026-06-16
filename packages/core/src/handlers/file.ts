import crypto from "node:crypto";
import { dbSession } from "../db/client";
import { findFile, insertFile } from "../db/files";
import { errorInvalidInput, errorMessages, errorNotFoundFile } from "./errors";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

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
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    },
  });
};

export const post = async ({ request, params }: HandlerArgs) => {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const buffer = Buffer.from(await file.arrayBuffer());

  const uploadKey = generateUploadKey();
  const downloadKey = generateDownloadKey();
  const inserted = insertFile(dbSession(params.session), file.name, buffer, file.type, uploadKey, downloadKey);
  if (!inserted) {
    return Response.json({ message: 'Failed to upload file.' }, { status: 500 });
  }

  // 実 kintone と同様、アップロードAPIは一時保管領域のキー（upload_key）を返す。
  // レコードに添付すると download_key へ振り替えられ、レコード取得時はそちらが返る。
  return Response.json({ fileKey: uploadKey });
};
