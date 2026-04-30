import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { get } from "@sonicgarden/kintone-emulator/handlers/fields";
import { withFailureInjection } from "@sonicgarden/kintone-emulator/handlers/with-failure-injection";
import type { LoaderFunctionArgs } from "react-router";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withFailureInjection(withAuth(get))({ request, params });
