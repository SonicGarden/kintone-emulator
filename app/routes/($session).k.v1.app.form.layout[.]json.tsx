import { LoaderFunctionArgs } from "@remix-run/node";
import { all, dbSession } from "~/utils/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const db = dbSession(params.session);
  const url = new URL(request.url);
  const appId = Number(url.searchParams.get('app'));

  const appResult = await all<{ layout: string; revision: number }>(
    db,
    `SELECT layout, revision FROM apps WHERE id = ?`,
    appId
  );

  return Response.json({
    layout: appResult[0] ? JSON.parse(appResult[0].layout) : [],
    revision: appResult[0] ? appResult[0].revision.toString() : '1',
  });
}
