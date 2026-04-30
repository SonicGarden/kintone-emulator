import { post } from "@sonicgarden/kintone-emulator/handlers/setup-space";
import type { ActionFunctionArgs } from "react-router";

export const action = ({ request, params }: ActionFunctionArgs) =>
  post({ request, params });
