// テスト用 Webhook 登録エンドポイント。
//   POST   /{session}/setup/webhook.json   { app, webhooks: [{ url, events }] } を登録（同 app は置き換え）
//   DELETE /{session}/setup/webhook.json   ?app=... または { app } で解除
//
// 実 kintone の Webhook 設定 API（preview/deploy）ではなく、他の setup/*.json と同じ
// エミュレータ専用のテスト設定エンドポイント。

import { dbSession } from "../db/client";
import { deleteWebhooksByApp, insertWebhook, WEBHOOK_EVENTS, type WebhookEvent } from "../db/webhooks";
import type { HandlerArgs } from "./types";

type WebhookInput = {
  url?: unknown;
  events?: unknown;
};

type PostBody = {
  app?: unknown;
  webhooks?: unknown;
};

export type WebhookEntry = { url: string; events: WebhookEvent[] };

const isValidEvents = (events: unknown): events is WebhookEvent[] =>
  Array.isArray(events) &&
  events.length > 0 &&
  events.every((e) => WEBHOOK_EVENTS.includes(e as WebhookEvent));

// setup/webhook.json と setup/app.json の両方から使う webhooks 配列のパース・検証。
// 不正なら message を返す（呼び出し側で 400 に変換する）。
export const parseWebhookEntries = (
  webhooks: unknown,
): { entries: WebhookEntry[] } | { error: string } => {
  if (!Array.isArray(webhooks)) {
    return { error: "webhooks must be an array" };
  }
  const entries: WebhookEntry[] = [];
  for (const item of webhooks as WebhookInput[]) {
    if (typeof item?.url !== "string" || item.url === "") {
      return { error: "webhooks[].url is required" };
    }
    if (!isValidEvents(item.events)) {
      return { error: `webhooks[].events must be a non-empty array of ${WEBHOOK_EVENTS.join(", ")}` };
    }
    entries.push({ url: item.url, events: item.events });
  }
  return { entries };
};

// 指定 app の Webhook を冪等に登録（既存を置き換える）。
export const replaceWebhooks = (
  db: ReturnType<typeof dbSession>,
  appId: string | number,
  entries: WebhookEntry[],
): void => {
  deleteWebhooksByApp(db, appId);
  for (const entry of entries) {
    insertWebhook(db, appId, entry.url, entry.events);
  }
};

export const post = async ({ request, params }: HandlerArgs): Promise<Response> => {
  const body = (await request.json()) as PostBody;

  if (body.app == null) {
    return Response.json({ message: "app is required" }, { status: 400 });
  }

  const parsed = parseWebhookEntries(body.webhooks);
  if ("error" in parsed) {
    return Response.json({ message: parsed.error }, { status: 400 });
  }

  replaceWebhooks(dbSession(params.session), body.app as string | number, parsed.entries);

  return Response.json({ result: "ok" });
};

export const del = async ({ request, params }: HandlerArgs): Promise<Response> => {
  const url = new URL(request.url);
  let app = url.searchParams.get("app");
  if (app == null && request.headers.get("content-type")?.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as PostBody;
    if (body.app != null) app = String(body.app);
  }

  if (app == null) {
    return Response.json({ message: "app is required" }, { status: 400 });
  }

  deleteWebhooksByApp(dbSession(params.session), app);
  return Response.json({ result: "ok" });
};
