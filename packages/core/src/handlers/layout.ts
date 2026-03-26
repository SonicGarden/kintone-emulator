import { findApp } from "../db/apps";
import { dbSession } from "../db/client";
import type { HandlerArgs } from "./types";

export const get = ({ request, params }: HandlerArgs) => {
  const appId = Number(new URL(request.url).searchParams.get('app'));
  const row = findApp(dbSession(params.session), appId);

  if (!row) {
    return Response.json({ message: 'App not found.' }, { status: 404 });
  }

  return Response.json({
    layout: JSON.parse(row.layout),
    revision: row.revision.toString(),
  });
};
