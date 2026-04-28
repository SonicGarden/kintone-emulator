import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { get, post } from "@sonicgarden/kintone-emulator/handlers/file";
import { withFailureInjection } from "@sonicgarden/kintone-emulator/handlers/with-failure-injection";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withFailureInjection(withAuth(get))({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) =>
  withFailureInjection(withAuth(post))({ request, params });
