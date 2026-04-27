import crypto from "node:crypto";
import { clearFailure, setFailure } from "../db/failure-injection";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

type Body = {
  nth?: number;
  pathPattern?: string;
};

const messages = {
  ja: "APIの同時リクエスト数が上限を超えています。",
  en: "The number of concurrent API requests exceeds the limit.",
} as const;

const generateId = () => crypto.randomBytes(15).toString("base64url");

const CONCURRENCY_LIMIT = 100;

export const post = async ({ request, params }: HandlerArgs): Promise<Response> => {
  const json = (await request.json()) as Body;
  if (typeof json.nth !== "number" || json.nth < 1) {
    return Response.json({ message: "nth must be a positive integer" }, { status: 400 });
  }
  const locale = detectLocale(request.headers.get("Accept-Language"));
  setFailure(params.session, {
    nth: json.nth,
    status: 429,
    body: {
      code: "GAIA_TO04",
      id: generateId(),
      message: messages[locale],
    },
    contentType: "application/json;charset=utf-8",
    extraHeaders: {
      "X-Cybozu-Error": "GAIA_TO04",
      "X-ConcurrencyLimit-Limit": String(CONCURRENCY_LIMIT),
      "X-ConcurrencyLimit-Running": String(CONCURRENCY_LIMIT + 1),
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
    pathPattern: json.pathPattern,
  });
  return Response.json({ result: "ok" });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const del = ({ params }: HandlerArgs): Response => {
  clearFailure(params.session);
  return Response.json({ result: "ok" });
};
