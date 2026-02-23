import { dbSession } from "../db/client";
import { findApp } from "../db/apps";
import type { HandlerArgs } from "./types";

export const get = async ({ request, params }: HandlerArgs) => {
  const appId = Number(new URL(request.url).searchParams.get('app'));
  const result = await findApp(dbSession(params.session), appId);

  if (result.length === 0) {
    return Response.json({ message: 'App not found.' }, { status: 404 });
  }

  return Response.json({
    layout: JSON.parse(result[0].layout),
    revision: result[0].revision.toString(),
  });
};
