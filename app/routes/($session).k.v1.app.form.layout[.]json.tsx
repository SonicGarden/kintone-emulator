import type { LoaderFunctionArgs } from "@remix-run/node";
import { loader as coreLoader } from "~/core/handlers/layout";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  coreLoader({ request, params });
