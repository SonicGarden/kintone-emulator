import type { LoaderFunctionArgs } from "@remix-run/node";
import { get } from "@sonicgarden/kintone-emulator/handlers/app";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });
