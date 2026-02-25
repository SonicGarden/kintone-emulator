import { get, post, put } from "@kintone-emulator/core/handlers/record";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  get({ request, params });

export const action = ({ request, params }: ActionFunctionArgs) => {
  switch (request.method) {
    case 'POST': return post({ request, params });
    case 'PUT': return put({ request, params });
    default: return Response.json({ message: 'Method Not Allowed' }, { status: 405 });
  }
};
