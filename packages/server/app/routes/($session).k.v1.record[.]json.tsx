import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { withAuth } from "@sonicgarden/kintone-emulator/handlers/auth";
import { get, post, put } from "@sonicgarden/kintone-emulator/handlers/record";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  withAuth(get)({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case 'POST': return withAuth(post)({ request, params });
    case 'PUT': return withAuth(put)({ request, params });
    default: return Response.json({ message: 'Method Not Allowed' }, { status: 405 });
  }
};
