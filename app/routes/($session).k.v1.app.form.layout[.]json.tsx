import type { LoaderFunctionArgs } from "@remix-run/node";
import { get } from "~/core/handlers/layout";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });
