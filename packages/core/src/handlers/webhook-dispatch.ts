// Webhook 配信エンジン + ペイロードビルダー。
//
// 設計方針: ハンドラー（record.ts 等）からは「最新の整形済みレコード / recordId」を渡して
// `await dispatchWebhookEvent(...)` を呼ぶだけ。fetch・失敗の握りつぶし・payload 構築は
// すべてこのモジュールに閉じ込める。
//
// 現状は同期（配信完了まで await）だが、将来 fire-and-forget に切り替えたくなった場合は
// 末尾の `await Promise.allSettled(...)` を「キューへ push して即 return」へ差し替えるだけでよく、
// ハンドラー側の呼び出しシグネチャは変更不要。

import type Database from "better-sqlite3";
import { findApp } from "../db/apps";
import { findWebhooksByApp, type WebhookEvent } from "../db/webhooks";

// record.json レスポンスと同形式の整形済みレコード（各フィールドが { type, value }）
type FormattedRecord = Record<string, { type?: string; value?: unknown } | undefined>;

export type WebhookContext =
  | {
      event: "ADD_RECORD" | "UPDATE_RECORD" | "UPDATE_STATUS";
      appId: string | number;
      recordId: string | number;
      record: FormattedRecord;
    }
  | {
      event: "DELETE_RECORD";
      appId: string | number;
      recordId: string | number;
    }
  | {
      event: "ADD_RECORD_COMMENT";
      appId: string | number;
      recordId: string | number;
      commentId: string | number;
      comment: unknown;
    };

export type DispatchOptions = {
  origin: string;
  // セッションプレフィックス（末尾に "/" を含む。デフォルトセッション時は空文字）
  sessionPrefix: string;
};

// request / session から URL 構築用のオプションを組み立てる
export const webhookUrlOptions = (
  request: Request,
  session: string | undefined,
): DispatchOptions => ({
  origin: new URL(request.url).origin,
  sessionPrefix: session ? `${session}/` : "",
});

const recordUrl = (opts: DispatchOptions, appId: string | number, recordId: string | number): string =>
  `${opts.origin}/${opts.sessionPrefix}k/${appId}/show#record=${recordId}`;

// recordTitle はベストエフォート近似。
// エミュレータにアプリのタイトルフィールド設定は無いため、
// RECORD_NUMBER → 先頭の SINGLE_LINE_TEXT → recordId の順でフォールバックする。
const deriveRecordTitle = (record: FormattedRecord, recordId: string | number): string => {
  for (const field of Object.values(record)) {
    if (field?.type === "RECORD_NUMBER" && field.value != null && field.value !== "") {
      return String(field.value);
    }
  }
  for (const field of Object.values(record)) {
    if (field?.type === "SINGLE_LINE_TEXT" && field.value != null && field.value !== "") {
      return String(field.value);
    }
  }
  return String(recordId);
};

const buildPayload = (
  ctx: WebhookContext,
  app: { id: string; name: string },
  opts: DispatchOptions,
): object => {
  const base = { id: crypto.randomUUID(), type: ctx.event, app };
  switch (ctx.event) {
    case "ADD_RECORD":
    case "UPDATE_RECORD":
    case "UPDATE_STATUS":
      return {
        ...base,
        record: ctx.record,
        recordTitle: deriveRecordTitle(ctx.record, ctx.recordId),
        url: recordUrl(opts, ctx.appId, ctx.recordId),
      };
    case "DELETE_RECORD":
      return {
        ...base,
        recordId: String(ctx.recordId),
        // API トークン認証ではユーザー不在のため固定ダミーユーザー
        deletedBy: { code: "emulator", name: "Emulator User" },
        // 他のタイムスタンプと同様にミリ秒を除去（実機は秒精度）
        deletedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      };
    case "ADD_RECORD_COMMENT":
      return {
        ...base,
        recordId: String(ctx.recordId),
        comment: ctx.comment,
        // コメントの URL は #record={id}&comment={commentId}
        url: `${recordUrl(opts, ctx.appId, ctx.recordId)}&comment=${ctx.commentId}`,
      };
  }
};

const matchesEvent = (rawEvents: string, event: WebhookEvent): boolean => {
  try {
    return (JSON.parse(rawEvents) as string[]).includes(event);
  } catch {
    return false;
  }
};

export const dispatchWebhookEvent = async (
  db: Database.Database,
  ctx: WebhookContext,
  opts: DispatchOptions,
): Promise<void> => {
  const targets = findWebhooksByApp(db, ctx.appId).filter((w) => matchesEvent(w.events, ctx.event));
  if (targets.length === 0) return;

  const appRow = findApp(db, Number(ctx.appId));
  const app = appRow
    ? { id: String(appRow.id), name: appRow.name }
    : { id: String(ctx.appId), name: "" };

  // 配信失敗（接続エラー・非2xx）はすべて握りつぶし、レコード操作 API には影響させない。
  await Promise.allSettled(
    targets.map((w) =>
      fetch(w.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(ctx, app, opts)),
      }).catch(() => undefined),
    ),
  );
};
