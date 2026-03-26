import type { ActionFunctionArgs } from "@remix-run/node";
import { post } from "@sonicgarden/kintone-emulator/handlers/finalize";

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
