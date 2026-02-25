import { get } from "@kintone-emulator/core/handlers/app";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });
