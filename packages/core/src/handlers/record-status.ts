// PUT /k/v1/record/status.json   (単体)
// PUT /k/v1/records/status.json  (一括)
// プロセス管理のアクション実行。最小実装:
//   - action.from が現在ステータスと一致することを検証
//   - レコード body の ステータス.value を action.to に更新し revision を +1
//   - assignee / filterCond / STATUS_ASSIGNEE は無視

import { dbSession } from "../db/client";
import { findRecord, updateRecord } from "../db/records";
import { errorInvalidInput, errorMessages, errorNotFoundApp, errorNotFoundRecord, generateErrorId } from "./errors";
import { enforceGuestSpace } from "./guest-space";
import { getStatusConfig, isStatusEnabled, STATUS_FIELD_CODE, type StatusAction, type StatusConfig } from "./process-status";
import type { HandlerArgs } from "./types";
import { detectLocale, type Locale } from "./validate";

// メッセージは実機の固定文と一致させる（2026-04-30 確認）。
const errorProcessNotEnabled = (locale: Locale) => {
  const message = locale === "ja"
    ? "操作に失敗しました。プロセス管理機能が無効化されています。"
    : "Your request failed. The process management feature has been disabled.";
  return Response.json(
    { code: "GAIA_ST02", id: generateErrorId(), message },
    { status: 400 },
  );
};

// from 不一致 / 未知のアクション。実機メッセージは action 名を含まず固定文。
const errorInvalidAction = (_actionName: string, locale: Locale) => {
  const message = locale === "ja"
    ? "ステータスの変更に失敗しました。ほかのユーザーがステータス、またはステータスの設定を変更した可能性があります。"
    : "Failed to update the status. The settings or the status itself may have been changed by someone.";
  return Response.json(
    { code: "GAIA_IL03", id: generateErrorId(), message },
    { status: 400 },
  );
};

const findAction = (config: StatusConfig, name: string): StatusAction | undefined => {
  return config.actions?.find((a) => a.name === name);
};

const transitionRecord = (
  db: ReturnType<typeof dbSession>,
  appId: string,
  id: string,
  actionName: string,
  config: StatusConfig,
  locale: Locale,
): { id: string; revision: string } | { error: Response } => {
  const target = findRecord(db, appId, id);
  if (!target) return { error: errorNotFoundRecord(id, locale) };

  const action = findAction(config, actionName);
  if (!action) return { error: errorInvalidAction(actionName, locale) };

  const body = JSON.parse(target.body) as Record<string, { value?: unknown }>;
  const current = (body[STATUS_FIELD_CODE]?.value as string | undefined) ?? "";
  if (action.from !== current) {
    return { error: errorInvalidAction(actionName, locale) };
  }

  body[STATUS_FIELD_CODE] = { value: action.to };
  const updated = updateRecord(db, appId, String(target.id), body);
  if (!updated) return { error: errorNotFoundRecord(id, locale) };
  return { id: updated.id.toString(), revision: updated.revision.toString() };
};

export const put = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);

  if (body.app == null) {
    return errorInvalidInput({ app: { messages: [m.requiredField] } }, locale);
  }
  if (body.id == null) {
    return errorInvalidInput({ id: { messages: [m.requiredField] } }, locale);
  }
  if (typeof body.action !== "string" || body.action === "") {
    return errorInvalidInput({ action: { messages: [m.requiredField] } }, locale);
  }

  const guestErr = enforceGuestSpace(db, body.app, params.guestSpaceId, locale);
  if (guestErr) return guestErr;

  const config = getStatusConfig(db, body.app);
  if (!config) return errorNotFoundApp(body.app, locale);
  if (!isStatusEnabled(config)) return errorProcessNotEnabled(locale);

  const result = transitionRecord(db, String(body.app), String(body.id), body.action, config, locale);
  if ("error" in result) return result.error;
  return Response.json({ revision: result.revision });
};

type BulkItem = { id?: string | number; action?: string; assignee?: string; revision?: string | number };

export const putBulk = async ({ request, params }: HandlerArgs) => {
  const body = await request.json();
  const db = dbSession(params.session);
  const locale = detectLocale(request.headers.get("accept-language"));
  const m = errorMessages(locale);

  if (body.app == null) {
    return errorInvalidInput({ app: { messages: [m.requiredField] } }, locale);
  }
  if (!Array.isArray(body.records) || body.records.length === 0) {
    return errorInvalidInput({ records: { messages: [m.requiredField] } }, locale);
  }

  const guestErr = enforceGuestSpace(db, body.app, params.guestSpaceId, locale);
  if (guestErr) return guestErr;

  const config = getStatusConfig(db, body.app);
  if (!config) return errorNotFoundApp(body.app, locale);
  if (!isStatusEnabled(config)) return errorProcessNotEnabled(locale);

  // better-sqlite3 のトランザクションは throw でしかロールバックしないため、
  // エラーを例外として投げて外で Response に変換する。
  class BulkAbort extends Error {
    constructor(readonly response: Response) {
      super("bulk abort");
    }
  }
  try {
    const updated = db.transaction(() => {
      const out: Array<{ id: string; revision: string }> = [];
      for (const item of body.records as BulkItem[]) {
        if (item.id == null || typeof item.action !== "string" || item.action === "") {
          throw new BulkAbort(errorInvalidInput({ records: { messages: [m.requiredField] } }, locale));
        }
        const r = transitionRecord(db, String(body.app), String(item.id), item.action, config, locale);
        if ("error" in r) throw new BulkAbort(r.error);
        out.push({ id: r.id, revision: r.revision });
      }
      return out;
    })();
    return Response.json({ records: updated });
  } catch (e) {
    if (e instanceof BulkAbort) return e.response;
    throw e;
  }
};
