import { post } from "@kintone-emulator/core/handlers/finalize";
import type { ActionFunctionArgs } from "@remix-run/node";

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
