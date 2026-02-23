import type { LoaderFunctionArgs } from "@remix-run/node";
import { loader as coreLoader } from "~/core/handlers/app";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  coreLoader({ request, params });
