import { del, get } from "@kintone-emulator/core/handlers/records";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "DELETE": return del({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
