import type { ActionFunctionArgs } from "@remix-run/node";
import { action as coreAction } from "~/core/handlers/initialize";

export const action = ({ request, params }: ActionFunctionArgs) =>
  coreAction({ request, params });
