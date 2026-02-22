import { ActionFunctionArgs, unstable_composeUploadHandlers, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData } from "@remix-run/node";
import { all, dbSession } from "~/utils/db.server";

export const loader = async ({ request, params }: ActionFunctionArgs) => {
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
}: ActionFunctionArgs) => {
  const db = dbSession(params.session);

  const uploadHandler = unstable_composeUploadHandlers(
    async ({ contentType, data, filename }) => {
      const raw: Uint8Array[] = [];
      for await (const chunk of data) {
        raw.push(chunk);
      }
      const _data = await new Blob(raw).arrayBuffer();
      const buffer = Buffer.from(_data);
      const recordResult = await all<{ id: number }>(db,
        `INSERT INTO files (filename, data, content_type) VALUES (?, ?, ?) RETURNING id`,
        filename, buffer, contentType
      );

      return recordResult[0].id.toString();
    },
    unstable_createMemoryUploadHandler()
  );

  const formData = await unstable_parseMultipartFormData(
    request,
    uploadHandler
  );

  return Response.json({
    fileKey: formData.get('file'),
  })
};

