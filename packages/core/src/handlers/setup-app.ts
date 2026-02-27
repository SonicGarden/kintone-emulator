import { insertApp } from "../db/apps";
import { dbSession } from "../db/client";
import { insertFields } from "../db/fields";
import type { FieldProperties } from "../db/fields";
import { insertRecord } from "../db/records";
import type { HandlerArgs } from "./types";

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

    const inserted = insertApp(
      db,
      body.name,
      body.layout ? JSON.stringify(body.layout) : '[]',
      body.status ? JSON.stringify(body.status) : undefined,
      toPositiveInt(body.id)
    );
    if (!inserted) {
      return Response.json({ message: 'Failed to create app.' }, { status: 500 });
    }

    if (body.properties) {
      insertFields(db, inserted.id, body.properties as FieldProperties);
    }

    if (Array.isArray(body.records)) {
      for (const record of body.records) {
        const { $id, ...recordBody } = record;
        const recordId = toPositiveInt($id?.value);
        const insertedRecord = insertRecord(db, inserted.id.toString(), recordBody, recordId);
        if (!insertedRecord) {
          return Response.json({ message: 'Failed to create record.' }, { status: 500 });
        }
      }
    }

    return Response.json({
      app: inserted.id.toString(),
      revision: inserted.revision.toString(),
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      return Response.json({ message: 'ID already exists.' }, { status: 400 });
    }
    throw e;
  }
};
