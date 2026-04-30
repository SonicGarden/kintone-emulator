import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { del, post } from "@sonicgarden/kintone-emulator/handlers/comment";
import { withFailureInjection } from "@sonicgarden/kintone-emulator/handlers/with-failure-injection";
import type { ActionFunctionArgs } from "react-router";

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "POST": return withFailureInjection(withAuth(post))({ request, params });
    case "DELETE": return withFailureInjection(withAuth(del))({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
