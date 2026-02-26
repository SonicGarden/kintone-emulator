import { get } from "@kintone-emulator/core/handlers/comment";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });
