import { dbSession } from "../db/client";
import { dropTables } from "../db/tables";
import type { HandlerArgs } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const post = ({ params }: HandlerArgs) => {
  dropTables(dbSession(params.session));
  return Response.json({ result: 'ok' });
};
