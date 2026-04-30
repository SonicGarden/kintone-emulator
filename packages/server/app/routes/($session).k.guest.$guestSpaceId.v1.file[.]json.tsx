import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { get, post } from "@sonicgarden/kintone-emulator/handlers/file";
import { withFailureInjection } from "@sonicgarden/kintone-emulator/handlers/with-failure-injection";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withFailureInjection(withAuth(get))({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) =>
  withFailureInjection(withAuth(post))({ request, params });
