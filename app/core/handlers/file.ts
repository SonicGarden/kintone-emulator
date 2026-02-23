import { dbSession } from "../db/client";
import { findFile, insertFile } from "../db/files";
import type { HandlerArgs } from "./types";

export const get = async ({ request, params }: HandlerArgs) => {
  const fileKey = new URL(request.url).searchParams.get('fileKey');
  const [file] = await findFile(dbSession(params.session), fileKey);
  if (!file) {
    return Response.json({ message: 'File not found.' }, { status: 404 });
  }

  const blob = new Blob([new Uint8Array(file.data)], { type: file.content_type });
  return new Response(await blob.arrayBuffer(), {
    headers: {
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    },
  });
};

export const post = async ({ request, params }: HandlerArgs) => {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const buffer = Buffer.from(await file.arrayBuffer());

  const [inserted] = await insertFile(dbSession(params.session), file.name, buffer, file.type);
  if (!inserted) {
    return Response.json({ message: 'Failed to upload file.' }, { status: 500 });
  }

  return Response.json({ fileKey: inserted.id.toString() });
};
