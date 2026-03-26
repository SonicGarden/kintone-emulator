import { dbSession } from "../db/client";
import { insertUser } from "../db/users";
import type { HandlerArgs } from "./types";

export const post = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);

  const { username, password } = body;
  if (typeof username !== "string" || typeof password !== "string") {
    return Response.json(
      { message: "username and password are required." },
      { status: 400 }
    );
  }

  try {
    insertUser(db, username, password);
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
      return Response.json({ message: "Username already exists." }, { status: 400 });
    }
    throw e;
  }
  return Response.json({ result: "ok" });
};
