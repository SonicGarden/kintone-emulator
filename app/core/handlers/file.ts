import { all, dbSession } from "../db";
import type { HandlerArgs } from "./types";

export const loader = async ({ request, params }: HandlerArgs) => {
  const db = dbSession(params.session);
  const fileKey = new URL(request.url).searchParams.get('fileKey');
  const recordResult = await all<{ data: ArrayBuffer, content_type: string, filename: string }>(db, `SELECT data, content_type, filename FROM files WHERE id = ?`, fileKey);
  if (recordResult.length === 0) {
    return Response.json({ message: 'File not found.' }, { status: 404 });
  }
  const blob = new Blob([new Uint8Array(recordResult[0].data)], { type: recordResult[0].content_type });
  return new Response(
    await blob.arrayBuffer(),
    {
      headers: {
        'Content-Disposition': `attachment; filename="${recordResult[0].filename}"`,
      },
    }
  )
}

export const action = async ({
  request,
  params,
}: HandlerArgs) => {
  const db = dbSession(params.session);

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const buffer = Buffer.from(await file.arrayBuffer());

  const recordResult = await all<{ id: number }>(db,
    `INSERT INTO files (filename, data, content_type) VALUES (?, ?, ?) RETURNING id`,
    file.name, buffer, file.type
  );

  return Response.json({
    fileKey: recordResult[0].id.toString(),
  })
};
