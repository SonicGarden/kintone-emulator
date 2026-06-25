import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { get, put } from "@sonicgarden/kintone-emulator/handlers/customize";
import { withFailureInjection } from "@sonicgarden/kintone-emulator/handlers/with-failure-injection";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withFailureInjection(withAuth(get))({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case "PUT": return withFailureInjection(withAuth(put))({ request, params });
    default: return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
};
