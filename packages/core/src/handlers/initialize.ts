import { dbSession } from "../db/client";
import { clearFailure } from "../db/failure-injection";
import { createTables } from "../db/tables";
import type { HandlerArgs } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const post = ({ params }: HandlerArgs) => {
  createTables(dbSession(params.session));
  clearFailure(params.session);
  return Response.json({ result: 'ok' });
};
