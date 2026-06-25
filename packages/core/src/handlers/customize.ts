import { findCustomize, updateCustomize } from "../db/apps";
import { dbSession } from "../db/client";
import { findDownloadKeyByUploadKey } from "../db/files";
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

type JsItem = { type: "URL"; url: string } | { type: "FILE"; file: { fileKey: string; name: string } };

const resolveFileKey = (db: ReturnType<typeof dbSession>, items: unknown[]): JsItem[] =>
  items.map((item) => {
    if (typeof item !== "object" || item === null) return item as JsItem;
    const typed = item as { type?: string; file?: { fileKey?: string; name?: string } };
    if (typed.type !== "FILE" || !typed.file?.fileKey) return item as JsItem;
    const downloadKey = findDownloadKeyByUploadKey(db, typed.file.fileKey);
    if (!downloadKey) return item as JsItem;
    return { type: "FILE", file: { ...typed.file, fileKey: downloadKey } } as JsItem;
  });

export const put = async ({ request, params }: HandlerArgs) => {
  const body = await request.json() as { app: string; desktop?: { js: unknown[]; css: unknown[] }; mobile?: { js: unknown[]; css: unknown[] } };
  const appId = Number(body.app);
  if (!appId) return Response.json({ message: "app is required" }, { status: 400 });

  const db = dbSession(params.session);
  const customize = {
    desktop: { js: resolveFileKey(db, body.desktop?.js ?? []), css: body.desktop?.css ?? [] },
    mobile: { js: resolveFileKey(db, body.mobile?.js ?? []), css: body.mobile?.css ?? [] },
  };
  updateCustomize(db, appId, customize as Parameters<typeof updateCustomize>[2]);
  return Response.json({ app: String(appId), revision: "1" });
};
