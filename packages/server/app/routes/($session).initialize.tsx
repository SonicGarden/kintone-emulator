import type { ActionFunctionArgs } from "@remix-run/node";
import { post } from "@sonicgarden/kintone-emulator/handlers/initialize";
import { withLogging } from "@sonicgarden/kintone-emulator";

export const action = ({ request, params }: ActionFunctionArgs) =>
  withLogging(post)({ request, params });
