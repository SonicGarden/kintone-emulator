import { clearFailure, setFailure } from "../db/failure-injection";
import type { HandlerArgs } from "./types";

type Body = {
  nth?: number;
  status?: number;
  body?: string | object;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  pathPattern?: string;
};

const inferContentType = (body: string | object): string =>
  typeof body === "string" ? "text/plain; charset=utf-8" : "application/json;charset=utf-8";

export const post = async ({ request, params }: HandlerArgs): Promise<Response> => {
  const json = (await request.json()) as Body;
  if (typeof json.nth !== "number" || json.nth < 1) {
    return Response.json({ message: "nth must be a positive integer" }, { status: 400 });
  }
  if (typeof json.status !== "number") {
    return Response.json({ message: "status is required" }, { status: 400 });
  }
  if (json.body === undefined) {
    return Response.json({ message: "body is required" }, { status: 400 });
  }
  setFailure(params.session, {
    nth: json.nth,
    status: json.status,
    body: json.body,
    contentType: json.contentType ?? inferContentType(json.body),
    extraHeaders: json.extraHeaders,
    pathPattern: json.pathPattern,
  });
  return Response.json({ result: "ok" });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const del = ({ params }: HandlerArgs): Response => {
  clearFailure(params.session);
  return Response.json({ result: "ok" });
};
