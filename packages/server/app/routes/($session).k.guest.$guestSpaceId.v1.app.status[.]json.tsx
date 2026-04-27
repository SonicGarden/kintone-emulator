import type { LoaderFunctionArgs } from "@remix-run/node";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { get } from "@sonicgarden/kintone-emulator/handlers/status";
import { withFailureInjection } from "@sonicgarden/kintone-emulator/handlers/with-failure-injection";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withFailureInjection(withAuth(get))({ request, params });
