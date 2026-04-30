import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { del, get, post, put } from "@sonicgarden/kintone-emulator/handlers/records";
import { withFailureInjection } from "@sonicgarden/kintone-emulator/handlers/with-failure-injection";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withFailureInjection(withAuth(get))({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "POST":   return withFailureInjection(withAuth(post))({ request, params });
    case "PUT":    return withFailureInjection(withAuth(put))({ request, params });
    case "DELETE": return withFailureInjection(withAuth(del))({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
