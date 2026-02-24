import type { ActionFunctionArgs } from "@remix-run/node";
import { post } from "~/core/handlers/setup-app";

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
