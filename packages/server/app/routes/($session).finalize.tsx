import { post } from "@sonicgarden/kintone-emulator/handlers/finalize";
import { withLogging } from "@sonicgarden/kintone-emulator";
import type { ActionFunctionArgs } from "react-router";

export const action = ({ request, params }: ActionFunctionArgs) =>
  withLogging(post)({ request, params });
