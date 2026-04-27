import { dbSession } from "../db/client";
import { insertSpace } from "../db/spaces";
import type { HandlerArgs } from "./types";

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ message: "id (positive integer) is required." }, { status: 400 });
  }

  const isGuest = Boolean(body.isGuest);
  const name = typeof body.name === "string" ? body.name : undefined;

  insertSpace(db, { id, isGuest, name });
  return Response.json({ result: "ok" });
};
