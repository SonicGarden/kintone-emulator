import type { LoaderFunctionArgs } from "@remix-run/node";
import { get } from "@kintone-emulator/core/handlers/records";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });
