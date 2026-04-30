import { insertApp } from "../db/apps";
import { dbSession } from "../db/client";
import { findFields, insertFields } from "../db/fields";
import type { FieldProperties } from "../db/fields";
import { insertRecord } from "../db/records";
import type { HandlerArgs } from "./types";
import { applyDefaults } from "./validate";

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

export const post = async ({ request, params }: HandlerArgs) => {
  try {
    const body = await request.json();
    const db = dbSession(params.session);

    const inserted = db.transaction(() => {
      const app = insertApp(
        db,
        body.name,
        body.layout ? JSON.stringify(body.layout) : '[]',
        body.status ? JSON.stringify(body.status) : undefined,
        toPositiveInt(body.id)
      );
      if (!app) throw new Error('Failed to create app.');

      if (body.properties) {
        insertFields(db, app.id, withDefaultSystemFields(body.properties as FieldProperties));
      }

      const recordIds: string[] = [];
      if (Array.isArray(body.records)) {
        const fieldRows = findFields(db, app.id);
        for (const record of body.records) {
          const { $id, ...recordBody } = record;
          const recordId = toPositiveInt($id?.value);
          const withDefaults = applyDefaults(fieldRows, recordBody);
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
