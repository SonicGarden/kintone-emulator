import crypto from "node:crypto";
import { clearFailure, setFailure } from "../db/failure-injection";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

type Body = {
  skip?: number;
  count?: number;
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
  if (json.skip !== undefined && (typeof json.skip !== "number" || json.skip < 0)) {
    return Response.json({ message: "skip must be a non-negative integer" }, { status: 400 });
  }
  if (json.count !== undefined && (typeof json.count !== "number" || json.count < 1)) {
    return Response.json({ message: "count must be a positive integer when specified" }, { status: 400 });
  }
  const locale = detectLocale(request.headers.get("Accept-Language"));
  setFailure(params.session, {
    skip: json.skip ?? 0,
    count: json.count,
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

 
export const del = ({ params }: HandlerArgs): Response => {
  clearFailure(params.session);
  return Response.json({ result: "ok" });
};
