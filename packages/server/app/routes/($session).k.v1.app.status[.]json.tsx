import type { LoaderFunctionArgs } from "@remix-run/node";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { get } from "@sonicgarden/kintone-emulator/handlers/status";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withAuth(get)({ request, params });
