import type { LoaderFunctionArgs } from "@remix-run/node";
import { get } from "~/core/handlers/apps";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });
