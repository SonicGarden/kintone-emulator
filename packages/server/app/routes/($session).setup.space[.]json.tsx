import type { ActionFunctionArgs } from "@remix-run/node";
import { post } from "@sonicgarden/kintone-emulator/handlers/setup-space";

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
