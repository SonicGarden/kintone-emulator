import { dbSession } from "../db/client";
import { clearFailure } from "../db/failure-injection";
import { dropTables } from "../db/tables";
import type { HandlerArgs } from "./types";

 
export const post = ({ params }: HandlerArgs) => {
  dropTables(dbSession(params.session));
  clearFailure(params.session);
  return Response.json({ result: 'ok' });
};
