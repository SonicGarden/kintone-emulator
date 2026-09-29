import { computeCalcFields } from "../calc/compute";
import { validateFieldsForInsert } from "../calc/field-validation";
import { insertApp } from "../db/apps";
import { dbSession } from "../db/client";
import { findFields, insertFields } from "../db/fields";
import type { FieldProperties } from "../db/fields";
import { insertRecord } from "../db/records";
import type { NumberPrecision } from "../query/number";
import { DEFAULT_NUMBER_PRECISION } from "../query/number";
import { errorFieldNotFound, errorInvalidCalcFormat, errorInvalidFormula } from "./errors";
import { validateLookupMappings } from "./lookup-validation";
import { applyInitialStatus, type StatusConfig } from "./process-status";
import type { HandlerArgs } from "./types";
import { applyDefaults, detectLocale, normalizeDropDown, normalizeNumbers, roundNumbers } from "./validate";
import { parseWebhookEntries, replaceWebhooks } from "./webhook";

// 実 kintone ではアプリ作成時にシステムフィールド（レコード番号 / 作成日時 / 更新日時 等）が常に存在する。
// setup/app.json で properties が指定されていても、ユーザーが同じ type を明示していなければ自動補完する。
// フィールドコードは ja 既定値（英語環境では異なるコードになるが後から変更も可能）。
const DEFAULT_SYSTEM_FIELDS: FieldProperties = {
  レコード番号: { type: "RECORD_NUMBER", code: "レコード番号", label: "レコード番号" },
  作成日時:     { type: "CREATED_TIME",  code: "作成日時",     label: "作成日時" },
  更新日時:     { type: "UPDATED_TIME",  code: "更新日時",     label: "更新日時" },
};

const withDefaultSystemFields = (properties: FieldProperties): FieldProperties => {
  const existingTypes = new Set(
    Object.values(properties).map((p) => (p as { type?: string }).type),
  );
  const result: FieldProperties = { ...properties };
  for (const [code, def] of Object.entries(DEFAULT_SYSTEM_FIELDS)) {
    if (!existingTypes.has((def as { type: string }).type)) {
      result[code] = def;
    }
  }
  return result;
};

const toPositiveInt = (value: unknown): number | undefined => {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
};

const ROUNDING_MODES = new Set(["HALF_EVEN", "UP", "DOWN"]);

/**
 * `numberPrecision` を実 kintone のアプリ設定と同じ範囲で検証し、文字列に揃える。
 * 範囲は kintone の設定画面の上限 (digits 1〜30 / decimalPlaces 0〜10)。
 * digits < decimalPlaces の組み合わせを実機がどう扱うかは確かめていないので、ここでは拒否する
 */
const parseNumberPrecision = (raw: unknown): NumberPrecision | { error: string } | undefined => {
  if (raw == null) return undefined;
  const r = raw as Partial<Record<keyof NumberPrecision, unknown>>;
  const digits = Number(r.digits ?? DEFAULT_NUMBER_PRECISION.digits);
  const decimalPlaces = Number(r.decimalPlaces ?? DEFAULT_NUMBER_PRECISION.decimalPlaces);
  const roundingMode = String(r.roundingMode ?? DEFAULT_NUMBER_PRECISION.roundingMode);
  if (!Number.isInteger(digits) || digits < 1 || digits > 30) return { error: "numberPrecision.digits must be 1-30." };
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 10 || decimalPlaces > digits) {
    return { error: "numberPrecision.decimalPlaces must be 0-10 and not exceed digits." };
  }
  if (!ROUNDING_MODES.has(roundingMode)) return { error: "numberPrecision.roundingMode must be HALF_EVEN, UP or DOWN." };
  return {
    digits: String(digits),
    decimalPlaces: String(decimalPlaces),
    roundingMode: roundingMode as NumberPrecision["roundingMode"],
  };
};

export const post = async ({ request, params }: HandlerArgs) => {
  try {
    const locale = detectLocale(request.headers.get("accept-language"));
    const body = await request.json();
    const db = dbSession(params.session);

    const properties = body.properties
      ? withDefaultSystemFields(body.properties as FieldProperties)
      : undefined;

    if (properties) {
      const lookupIssue = validateLookupMappings([], properties);
      if (lookupIssue) return errorFieldNotFound(lookupIssue.missingField, locale);
      const issue = validateFieldsForInsert([], properties);
      if (issue) {
        if (issue.kind === "format_enum") return errorInvalidCalcFormat(issue.key, locale);
        return errorInvalidFormula(issue.fieldLabel, issue.detailMessage, locale);
      }
    }

    // webhooks はアプリ作成と同時に登録できる（setup/webhook.json と同形式）
    let webhookEntries: ReturnType<typeof parseWebhookEntries> | null = null;
    if (body.webhooks !== undefined) {
      const parsed = parseWebhookEntries(body.webhooks);
      if ("error" in parsed) {
        return Response.json({ message: parsed.error }, { status: 400 });
      }
      webhookEntries = parsed;
    }

    const numberPrecision = parseNumberPrecision(body.numberPrecision);
    if (numberPrecision && "error" in numberPrecision) {
      return Response.json({ message: numberPrecision.error }, { status: 400 });
    }

    const inserted = db.transaction(() => {
      const app = insertApp(db, {
        name: body.name,
        layout: body.layout ? JSON.stringify(body.layout) : '[]',
        status: body.status ? JSON.stringify(body.status) : undefined,
        id: toPositiveInt(body.id),
        spaceId: toPositiveInt(body.spaceId),
        threadId: toPositiveInt(body.threadId),
        numberPrecision,
      });
      if (!app) throw new Error('Failed to create app.');

      if (properties) {
        insertFields(db, app.id, properties);
      }

      if (webhookEntries && "entries" in webhookEntries) {
        replaceWebhooks(db, app.id, webhookEntries.entries);
      }

      const recordIds: string[] = [];
      if (Array.isArray(body.records)) {
        const fieldRows = findFields(db, app.id);
        const statusConfig = body.status as StatusConfig | undefined;
        for (const record of body.records) {
          const { $id, ...recordBody } = record;
          const recordId = toPositiveInt($id?.value);
          const withStatus = applyInitialStatus(statusConfig ?? null, recordBody);
          // setup は検証しない（テストの前提データを入れるため）が、保存値の形は addRecords と揃える
          const withDefaults = roundNumbers(
            fieldRows,
            normalizeDropDown(fieldRows, normalizeNumbers(fieldRows, applyDefaults(fieldRows, withStatus))),
            numberPrecision ?? DEFAULT_NUMBER_PRECISION,
          );
          const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
          computeCalcFields(fieldRows, withDefaults, { createdAt: now, updatedAt: now });
          const insertedRecord = insertRecord(db, app.id.toString(), withDefaults, recordId);
          if (!insertedRecord) throw new Error('Failed to create record.');
          recordIds.push(insertedRecord.id.toString());
        }
      }

      return { app, recordIds };
    })();

    return Response.json({
      app: inserted.app.id.toString(),
      revision: inserted.app.revision.toString(),
      recordIds: inserted.recordIds,
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      return Response.json({ message: 'ID already exists.' }, { status: 400 });
    }
    if (e instanceof Error && (e.message === 'Failed to create app.' || e.message === 'Failed to create record.')) {
      return Response.json({ message: e.message }, { status: 500 });
    }
    throw e;
  }
};
