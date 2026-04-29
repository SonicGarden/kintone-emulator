import type { ActionFunctionArgs } from "@remix-run/node";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { putBulk } from "@sonicgarden/kintone-emulator/handlers/record-status";
import { withFailureInjection } from "@sonicgarden/kintone-emulator/handlers/with-failure-injection";

export const action = ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "PUT") {
    return Response.json({ message: "Method Not Allowed" }, { status: 405 });
  }
  return withFailureInjection(withAuth(putBulk))({ request, params });
};
