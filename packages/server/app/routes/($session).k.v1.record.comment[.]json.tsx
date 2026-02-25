import { del, post } from "@kintone-emulator/core/handlers/comment";
import type { ActionFunctionArgs } from "@remix-run/node";

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "POST": return post({ request, params });
    case "DELETE": return del({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
