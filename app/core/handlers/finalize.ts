import { dbSession, serialize } from "../db";
import type { HandlerArgs } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const post = async ({ params }: HandlerArgs) => {
  const db = dbSession(params.session);
  await serialize(db, () => {
    db.run(
      "DROP TABLE IF EXISTS fields",
    );
    db.run(
      "DROP TABLE IF EXISTS records"
    );
    db.run(
      "DROP TABLE IF EXISTS files"
    );
    db.run(
      "DROP TABLE IF EXISTS apps"
    )
  });

  return Response.json({ result: 'ok' });
}
