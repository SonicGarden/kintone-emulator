import type { ActionFunctionArgs } from "@remix-run/node";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { del, post } from "@sonicgarden/kintone-emulator/handlers/comment";

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "POST": return withAuth(post)({ request, params });
    case "DELETE": return withAuth(del)({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
