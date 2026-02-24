import type { ActionFunctionArgs } from "@remix-run/node";
import { del, post } from "~/core/handlers/comment";

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "POST": return post({ request, params });
    case "DELETE": return del({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
