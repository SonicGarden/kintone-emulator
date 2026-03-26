import type { LoaderFunctionArgs } from "@remix-run/node";
import { get } from "@sonicgarden/kintone-emulator/handlers/app";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withAuth(get)({ request, params });
