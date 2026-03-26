import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { del, get } from "@sonicgarden/kintone-emulator/handlers/records";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withAuth(get)({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "DELETE": return withAuth(del)({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
