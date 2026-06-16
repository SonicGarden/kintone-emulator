import { withLogging } from "@sonicgarden/kintone-emulator";
import { post } from "@sonicgarden/kintone-emulator/handlers/finalize";
import type { ActionFunctionArgs } from "react-router";

export const action = ({ request, params }: ActionFunctionArgs) =>
  withLogging(post)({ request, params });
