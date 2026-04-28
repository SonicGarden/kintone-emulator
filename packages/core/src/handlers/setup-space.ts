import { dbSession } from "../db/client";
import { insertSpace } from "../db/spaces";
import type { HandlerArgs } from "./types";

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);

  let id: number | undefined;
  if (body.id != null) {
    const n = Number(body.id);
    if (!Number.isInteger(n) || n <= 0) {
      return Response.json({ message: "id must be a positive integer." }, { status: 400 });
    }
    id = n;
  }

  const isGuest = Boolean(body.isGuest);
  const name = typeof body.name === "string" ? body.name : undefined;

  const result = insertSpace(db, { id, isGuest, name });
  return Response.json({ id: result.id });
};
