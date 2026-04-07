import crypto from "node:crypto";
import { dbSession } from "../db/client";
import { isAuthEnabled, verifyUser } from "../db/users";
import type { HandlerArgs } from "./types";

const generateId = () => crypto.randomBytes(15).toString("base64url");

const isJapanese = (request: Request) => {
  const lang = request.headers.get("Accept-Language") ?? "";
  return lang.startsWith("ja");
};

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

const loginRequiredResponse = (request: Request) => {
  const lang = isJapanese(request) ? "ja" : "en";
  return Response.json(
    { message: messages.loginRequired[lang], id: generateId(), code: "CB_AU01" },
    { status: 401 }
  );
};

const authFailedResponse = (request: Request) => {
  const lang = isJapanese(request) ? "ja" : "en";
  return Response.json(
    { message: messages.authFailed[lang], id: generateId(), code: "CB_WA01" },
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
