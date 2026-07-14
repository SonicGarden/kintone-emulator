import { findApp, findCustomize } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import { findFields } from "@sonicgarden/kintone-emulator/db/fields";
import { insertRecord } from "@sonicgarden/kintone-emulator/db/records";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, data, useFetcher, useLoaderData, useNavigate } from "react-router";
import { RecordDetailFields } from "../components/RecordDetailFields";
import { SiteHeader } from "../components/SiteHeader";

export const meta: MetaFunction = () => [{ title: "kintone emulator" }];

export const loader = ({ params }: LoaderFunctionArgs) => {
  try {
    const db = dbSession(params.session);
    const app = findApp(db, Number(params.appId));
    if (!app) throw data(null, { status: 404 });

    const fieldRows = findFields(db, app.id);
    const fields = fieldRows.map(
      (row) => JSON.parse(row.body) as { type: string; code: string; label: string }
    );

    const customize = findCustomize(db, app.id);
    const customizeJs = customize.desktop?.js ?? [];
    return { app, fields, customizeJs, session: params.session ?? null };
  } catch (e) {
    if (e instanceof Response || (e != null && typeof e === "object" && "status" in e)) throw e;
    throw data(null, { status: 404 });
  }
};

const READONLY_FIELD_TYPES = new Set([
  "__ID__", "__REVISION__", "RECORD_NUMBER",
  "CREATOR", "MODIFIER", "CREATED_TIME", "UPDATED_TIME",
  "CALC", "SUBTABLE", "FILE",
]);

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const db = dbSession(params.session);
  const appId = params.appId;
  if (!appId) throw data(null, { status: 400 });
  const form = await request.formData();

  const fieldRows = findFields(db, Number(appId));
  const fieldMap = Object.fromEntries(
    fieldRows.map((row) => {
      const f = JSON.parse(row.body) as { type: string; code: string };
      return [f.code, f];
    })
  );

  const recordBody: KintoneRecord = {};
  for (const [key, val] of form.entries()) {
    if (!key.startsWith("field:")) continue;
    const code = key.slice("field:".length);
    const fieldDef = fieldMap[code];
    if (!fieldDef || READONLY_FIELD_TYPES.has(fieldDef.type)) continue;
    recordBody[code] = { type: fieldDef.type, value: String(val) };
  }

  const result = insertRecord(db, appId, recordBody);
  return Response.json({ recordId: result?.id });
};

export default function RecordCreatePage() {
  const { app, fields, session } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const prefix = session ? `${session}/` : "";

  const [editRecord, setEditRecord] = useState<KintoneRecord>({});

  // create.show イベントを一度だけ発火
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    window.__kintoneAppId = app.id;

    const fireShow = async () => {
      const emptyRecord: KintoneRecord = Object.fromEntries(
        fields.map((f) => [f.code, { type: f.type, value: "" }])
      );
      const result = await window.kintone?.events.fire("app.record.create.show", {
        type: "app.record.create.show",
        appId: app.id,
        record: emptyRecord,
      });
      setEditRecord(result?.record ?? emptyRecord);
    };
    fireShow();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // フィールド変更ハンドラ
  const handleFieldChange = useCallback(
    async (code: string, value: string) => {
      const cell = editRecord[code];
      const newRecord: KintoneRecord = {
        ...editRecord,
        [code]: { ...(cell ?? {}), value },
      };
      const eventType = `app.record.create.change.${code}`;
      const result = await window.kintone?.events.fire(eventType, {
        type: eventType,
        appId: app.id,
        record: newRecord,
        changes: {
          field: {
            type: fields.find((f) => f.code === code)?.type ?? "SINGLE_LINE_TEXT",
            value,
          },
        },
      });
      setEditRecord(result?.record ?? newRecord);
    },
    [editRecord, app.id, fields]
  );

  // 保存フェッチャー
  const createFetcher = useFetcher<{ recordId: number }>();
  const handledRef = useRef<unknown>(null);
  useEffect(() => {
    if (createFetcher.state !== "idle" || !createFetcher.data) return;
    if (handledRef.current === createFetcher.data) return;
    handledRef.current = createFetcher.data;
    const { recordId } = createFetcher.data;
    if (recordId) navigate(`/${prefix}k/${app.id}/show#record=${recordId}&mode=show`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFetcher.state, createFetcher.data]);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    for (const [code, cell] of Object.entries(editRecord)) {
      if (cell) formData.append(`field:${code}`, String(cell.value ?? ""));
    }
    createFetcher.submit(formData, { method: "post" });
  }, [editRecord, createFetcher]);

  const listUrl = `/${prefix}k/${app.id}`;
  const settingsUrl = `/${prefix}k/admin/app/flow?app=${app.id}#section=settings`;

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader session={session} logoHref={`/${prefix}k/`}>
        <span className="text-sm text-gray-700 font-medium ml-2">{app.name}</span>
        <div className="gaia-argoui-app-menu ml-auto flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="text-xs text-white bg-blue-600 rounded px-3 py-1 hover:bg-blue-700"
          >
            保存
          </button>
          <Link
            to={listUrl}
            className="text-xs text-gray-500 border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-50"
          >
            キャンセル
          </Link>
          <Link
            to={settingsUrl}
            className="gaia-argoui-app-menu-settings text-xs text-gray-500 border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-50"
          >
            アプリ設定
          </Link>
        </div>
      </SiteHeader>

      <div className="contents-gaia px-6 py-6">
        <div className="mb-4">
          <Link to={listUrl} className="text-sm text-blue-600 hover:underline">
            ← 一覧に戻る
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-3xl">
          <div className="px-6 py-4 border-b border-gray-100">
            <h1 className="text-base font-semibold text-gray-700">新規レコード作成</h1>
          </div>
          <div className="px-6 py-4">
            <RecordDetailFields
              fields={fields}
              record={editRecord}
              mode="create"
              onFieldChange={handleFieldChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
