import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { loader as coreLoader, action as coreAction } from "~/core/handlers/file";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  coreLoader({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) =>
  coreAction({ request, params });
