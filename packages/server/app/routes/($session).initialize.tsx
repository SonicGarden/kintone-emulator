import type { ActionFunctionArgs } from "@remix-run/node";
import { post } from "@kintone-emulator/core/handlers/initialize";

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
