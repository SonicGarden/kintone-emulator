// GET /k/v1/app.json
// https://cybozu.dev/ja/kintone/docs/rest-api/apps/get-app/

import { LoaderFunctionArgs } from "@remix-run/node";
import { all, dbSession } from "~/utils/db.server";

type AppRow = { id: number; name: string; created_at: string; updated_at: string };

const toAppResponse = (row: AppRow) => ({
  appId: row.id.toString(),
  code: "",
  name: row.name,
  description: "",
  spaceId: null,
  threadId: null,
  createdAt: row.created_at,
  creator: { code: "", name: "" },
  modifiedAt: row.updated_at,
  modifier: { code: "", name: "" },
});

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const db = dbSession(params.session);
  const url = new URL(request.url);

  const idParam = url.searchParams.get('id');
  if (!idParam) {
    return Response.json({ message: 'id is required.' }, { status: 400 });
  }

  const result = await all<AppRow>(
    db,
    `SELECT id, name, created_at, updated_at FROM apps WHERE id = ?`,
    Number(idParam)
  );

  if (result.length === 0) {
    return Response.json({ message: 'App not found.' }, { status: 404 });
  }

  return Response.json(toAppResponse(result[0]));
};
