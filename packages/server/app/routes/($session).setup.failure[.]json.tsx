import { del, post } from "@sonicgarden/kintone-emulator/handlers/setup-failure";
import type { ActionFunctionArgs } from "react-router";

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "POST": return post({ request, params });
    case "DELETE": return del({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
