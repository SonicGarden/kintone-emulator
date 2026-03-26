import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { get, post } from "@sonicgarden/kintone-emulator/handlers/file";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withAuth(get)({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) =>
  withAuth(post)({ request, params });
