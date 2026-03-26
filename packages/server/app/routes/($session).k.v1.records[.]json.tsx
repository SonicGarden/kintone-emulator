import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { del, get } from "@sonicgarden/kintone-emulator/handlers/records";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "DELETE": return del({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
