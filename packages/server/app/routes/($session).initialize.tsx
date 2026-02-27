import { post } from "@kintone-emulator/core/handlers/initialize";
import type { ActionFunctionArgs } from "@remix-run/node";

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
