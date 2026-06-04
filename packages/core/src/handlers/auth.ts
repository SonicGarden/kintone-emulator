import crypto from "node:crypto";
import { dbSession } from "../db/client";
import { isAuthEnabled, verifyUser } from "../db/users";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

const generateId = () => crypto.randomBytes(15).toString("base64url");

const messages = {
  loginRequired: {
    ja: "ログインしてください。",
    en: "Please login.",
  },
  authFailed: {
    ja: "ユーザーのパスワード認証に失敗しました。「X-Cybozu-Authorization」ヘッダーの値が正しくありません。",
    en: "Password authentication failed. The value in http header of X-Cybozu-Authorization is not valid.",
  },
} as const;

const requestLocale = (request: Request) =>
  detectLocale(request.headers.get("Accept-Language"));

const loginRequiredResponse = (request: Request) => {
  return Response.json(
    { message: messages.loginRequired[requestLocale(request)], id: generateId(), code: "CB_AU01" },
    { status: 401 }
  );
};

const authFailedResponse = (request: Request) => {
  return Response.json(
    { message: messages.authFailed[requestLocale(request)], id: generateId(), code: "CB_WA01" },
    { status: 401 }
  );
};

export const authenticate = (
  request: Request,
  session: string | undefined
): Response | null => {
  const db = dbSession(session);

  if (!isAuthEnabled(db)) return null;

  const authHeader = request.headers.get("X-Cybozu-Authorization");
  if (!authHeader) return loginRequiredResponse(request);

  let username: string;
  let password: string;
  try {
    const decoded = atob(authHeader);
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return authFailedResponse(request);
    username = decoded.substring(0, colonIndex);
    password = decoded.substring(colonIndex + 1);
  } catch {
    return authFailedResponse(request);
  }

  if (!verifyUser(db, username, password)) return authFailedResponse(request);

  return null;
};

export const withAuth =
  (handler: (args: HandlerArgs) => Response | Promise<Response>) =>
  (args: HandlerArgs): Response | Promise<Response> => {
    const authResult = authenticate(args.request, args.params.session);
    if (authResult) return authResult;
    return handler(args);
  };
