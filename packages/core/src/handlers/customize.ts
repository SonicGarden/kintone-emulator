import { findCustomize, updateCustomize } from "../db/apps";
import { dbSession } from "../db/client";
import { errorInvalidInput, errorMessages } from "./errors";
import type { HandlerArgs } from "./types";
import { detectLocale } from "./validate";

export const get = ({ request, params }: HandlerArgs) => {
  const locale = detectLocale(request.headers.get("accept-language"));
  const appId = Number(new URL(request.url).searchParams.get("app"));
  if (!appId) {
    return errorInvalidInput({ app: { messages: [errorMessages(locale).requiredField] } }, locale);
  }
  const db = dbSession(params.session);
  const customize = findCustomize(db, appId);
  return Response.json({ ...customize, app: String(appId), revision: "1" });
};

export const put = async ({ request, params }: HandlerArgs) => {
  const body = await request.json() as { app: string; desktop?: { js: unknown[]; css: unknown[] }; mobile?: { js: unknown[]; css: unknown[] } };
  const appId = Number(body.app);
  if (!appId) return Response.json({ message: "app is required" }, { status: 400 });

  const db = dbSession(params.session);
  const customize = {
    desktop: { js: body.desktop?.js ?? [], css: body.desktop?.css ?? [] },
    mobile: { js: body.mobile?.js ?? [], css: body.mobile?.css ?? [] },
  };
  updateCustomize(db, appId, customize as Parameters<typeof updateCustomize>[2]);
  return Response.json({ app: String(appId), revision: "1" });
};
