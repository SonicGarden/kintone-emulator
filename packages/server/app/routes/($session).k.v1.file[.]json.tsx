import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { get, post } from "@kintone-emulator/core/handlers/file";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
