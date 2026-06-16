import { dbSession } from "../db/client";
import { findFile, insertFile } from "../db/files";
import { errorInvalidInput, errorMessages, errorNotFoundFile } from "./errors";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

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

  const inserted = insertFile(dbSession(params.session), file.name, buffer, file.type);
  if (!inserted) {
    return Response.json({ message: 'Failed to upload file.' }, { status: 500 });
  }

  return Response.json({ fileKey: inserted.id.toString() });
};
