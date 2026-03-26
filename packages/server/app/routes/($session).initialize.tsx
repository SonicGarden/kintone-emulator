import type { ActionFunctionArgs } from "@remix-run/node";
import { post } from "@sonicgarden/kintone-emulator/handlers/initialize";

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
