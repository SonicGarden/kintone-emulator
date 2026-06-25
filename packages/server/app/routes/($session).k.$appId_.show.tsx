import { findApp, findCustomize } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import { findFields } from "@sonicgarden/kintone-emulator/db/fields";
import { deleteRecords, findRecord, updateRecord } from "@sonicgarden/kintone-emulator/db/records";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, data, useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";
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

type ActionResult = { record: KintoneRecord } | { deleted: true };

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const db = dbSession(params.session);
  const appId = params.appId;
  if (!appId) throw data(null, { status: 400 });
  const form = await request.formData();
  const method = String(form.get("_method") ?? "UPDATE");

  const recordId = form.get("record_id");
  if (!recordId || typeof recordId !== "string") throw data(null, { status: 400 });

  if (method === "DELETE_RECORD") {
    deleteRecords(db, appId, [recordId]);
    return Response.json({ deleted: true } satisfies ActionResult);
  }

  const existing = findRecord(db, appId, recordId);
  if (!existing) throw data(null, { status: 404 });

  const existingBody = JSON.parse(existing.body) as KintoneRecord;

  const fieldRows = findFields(db, Number(appId));
  const editableCodes = new Set(
    fieldRows
      .map((row) => JSON.parse(row.body) as { type: string; code: string })
      .filter((f) => !READONLY_FIELD_TYPES.has(f.type))
      .map((f) => f.code)
  );

  for (const [key, val] of form.entries()) {
    if (!key.startsWith("field:")) continue;
    const code = key.slice("field:".length);
    if (!editableCodes.has(code)) continue;
    const cell = existingBody[code];
    if (cell) existingBody[code] = { ...cell, value: String(val) };
  }

  updateRecord(db, appId, recordId, existingBody);
  const updated = findRecord(db, appId, recordId);
  const record = JSON.parse(updated!.body) as KintoneRecord;
  return Response.json({ record } satisfies ActionResult);
};

type RecordBody = KintoneRecord;

function useHashParams() {
  const location = useLocation();
  const hash = location.hash.slice(1);
  const hashParams = new URLSearchParams(hash);
  return {
    recordId: hashParams.get("record"),
    mode: hashParams.get("mode") ?? "show",
  };
}

export default function RecordShowPage() {
  const { app, fields, session } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { recordId, mode } = useHashParams();
  const prefix = session ? `${session}/` : "";
  const isEdit = mode === "edit";

  // APIからレコードを取得
  const loadFetcher = useFetcher<{ record: RecordBody }>();
  useEffect(() => {
    if (!recordId) return;
    loadFetcher.load(`/${prefix}k/v1/record.json?app=${app.id}&id=${recordId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, prefix, app.id]);
  const record = loadFetcher.data?.record ?? null;
  const loading = loadFetcher.state === "loading";

  // 編集用の制御済みレコード状態
  const [editRecord, setEditRecord] = useState<RecordBody | null>(null);

  const editableCodes = useMemo(
    () => new Set(fields.filter((f) => !READONLY_FIELD_TYPES.has(f.type)).map((f) => f.code)),
    [fields]
  );

  // show/edit イベントを一度だけ発火（recordId + mode の組み合わせでキー管理）
  const firedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!record || !recordId) return;
    const key = `${recordId}-${mode}`;
    if (firedKeyRef.current === key) return;
    firedKeyRef.current = key;

    window.__kintoneAppId = app.id;

    const fireEvent = async () => {
      if (mode === "show") {
        const result = await window.kintone?.events.fire("app.record.detail.show", {
          type: "app.record.detail.show",
          appId: app.id,
          recordId: Number(recordId),
          record,
        });
        window.__kintoneRecord = result?.record ?? record;
      } else if (mode === "edit") {
        const result = await window.kintone?.events.fire("app.record.edit.show", {
          type: "app.record.edit.show",
          appId: app.id,
          recordId: Number(recordId),
          record,
        });
        setEditRecord(result?.record ?? record);
        window.__kintoneRecord = result?.record ?? record;
      }
    };
    fireEvent();
  }, [record, recordId, mode, app.id]);

  // 保存フェッチャー
  const saveFetcher = useFetcher<ActionResult>();
  const handledSaveRef = useRef<unknown>(null);
  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    if (handledSaveRef.current === saveFetcher.data) return;
    handledSaveRef.current = saveFetcher.data;

    const saveData = saveFetcher.data;
    if (!("record" in saveData)) return;

    const defaultUrl = `/${prefix}k/${app.id}/show#record=${recordId}&mode=show`;
    const fireSuccess = async () => {
      const result = await window.kintone?.events.fire("app.record.edit.submit.success", {
        type: "app.record.edit.submit.success",
        appId: app.id,
        recordId: recordId ? Number(recordId) : 0,
        record: saveData.record,
        url: defaultUrl,
      });
      navigate(result?.url ?? defaultUrl);
    };
    fireSuccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveFetcher.state, saveFetcher.data]);

  // 削除フェッチャー
  const deleteFetcher = useFetcher<ActionResult>();
  const handledDeleteRef = useRef<unknown>(null);
  useEffect(() => {
    if (deleteFetcher.state !== "idle" || !deleteFetcher.data) return;
    if (handledDeleteRef.current === deleteFetcher.data) return;
    handledDeleteRef.current = deleteFetcher.data;
    if ("deleted" in deleteFetcher.data) {
      navigate(`/${prefix}k/${app.id}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteFetcher.state, deleteFetcher.data]);

  // フィールド変更ハンドラ（kintone change イベントを発火）
  const handleFieldChange = useCallback(
    async (code: string, value: string) => {
      if (!editRecord) return;
      const cell = editRecord[code];
      const newRecord: RecordBody = {
        ...editRecord,
        [code]: { ...(cell ?? {}), value },
      };
      const eventType = `app.record.${mode}.change.${code}`;
      const result = await window.kintone?.events.fire(eventType, {
        type: eventType,
        appId: app.id,
        recordId: recordId ? Number(recordId) : undefined,
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
    [editRecord, mode, app.id, recordId, fields]
  );

  // 保存ボタン
  const handleSave = useCallback(() => {
    if (!editRecord || !recordId) return;
    const formData = new FormData();
    formData.append("record_id", recordId);
    for (const [code, cell] of Object.entries(editRecord)) {
      if (cell && editableCodes.has(code)) {
        formData.append(`field:${code}`, String(cell.value ?? ""));
      }
    }
    saveFetcher.submit(formData, { method: "post" });
  }, [editRecord, recordId, editableCodes, saveFetcher]);

  // 削除ボタン
  const handleDelete = useCallback(async () => {
    if (!recordId || !record) return;
    if (!window.confirm("このレコードを削除しますか？")) return;

    await window.kintone?.events.fire("app.record.detail.delete.submit", {
      type: "app.record.detail.delete.submit",
      appId: app.id,
      recordId: Number(recordId),
      record,
    });

    const formData = new FormData();
    formData.append("record_id", recordId);
    formData.append("_method", "DELETE_RECORD");
    deleteFetcher.submit(formData, { method: "post" });
  }, [recordId, record, app.id, deleteFetcher]);

  const listUrl = `/${prefix}k/${app.id}`;
  const createUrl = `/${prefix}k/${app.id}/create`;
  const settingsUrl = `/${prefix}k/admin/app/flow?app=${app.id}#section=settings`;
  const showUrl = recordId ? `#record=${recordId}&mode=show` : "#";
  const editUrl = recordId ? `#record=${recordId}&mode=edit` : "#";

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader session={session} logoHref={`/${prefix}k/`}>
        <span className="text-sm text-gray-700 font-medium ml-2">{app.name}</span>
        <div className="gaia-argoui-app-menu ml-auto flex gap-3">
          {isEdit ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                className="text-xs text-white bg-blue-600 rounded px-3 py-1 hover:bg-blue-700"
              >
                保存
              </button>
              <Link
                to={showUrl}
                className="text-xs text-gray-500 border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-50"
              >
                キャンセル
              </Link>
            </>
          ) : (
            <>
              <Link
                to={editUrl}
                className="text-xs text-white bg-blue-600 rounded px-3 py-1 hover:bg-blue-700"
              >
                編集する
              </Link>
              {record && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-xs text-red-600 border border-red-300 rounded px-2.5 py-1 hover:bg-red-50"
                >
                  削除
                </button>
              )}
            </>
          )}
          <Link
            to={settingsUrl}
            className="gaia-argoui-app-menu-settings text-xs text-gray-500 border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-50"
          >
            アプリ設定
          </Link>
        </div>
      </SiteHeader>

      <div className="contents-gaia px-6 py-6">
        <div className="mb-4 flex gap-4">
          <Link to={listUrl} className="text-sm text-blue-600 hover:underline">
            ← 一覧に戻る
          </Link>
          <Link to={createUrl} className="text-sm text-blue-600 hover:underline">
            + 新規作成
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-3xl">
          <div className="px-6 py-4 border-b border-gray-100">
            <h1 className="text-base font-semibold text-gray-700">
              {recordId ? `レコード #${recordId}` : "レコードを選択してください"}
            </h1>
          </div>

          <div className="px-6 py-4">
            {!recordId && (
              <p className="text-sm text-gray-400">URLのハッシュにレコードIDを指定してください。</p>
            )}
            {recordId && loading && <p className="text-sm text-gray-400">読み込み中...</p>}
            {recordId && !loading && !record && (
              <p className="text-sm text-red-500">レコードが見つかりませんでした。</p>
            )}
            {recordId && !loading && record && !isEdit && (
              <RecordDetailFields fields={fields} record={record} mode="show" />
            )}
            {recordId && !loading && record && isEdit && editRecord && (
              <RecordDetailFields
                fields={fields}
                record={editRecord}
                mode="edit"
                onFieldChange={handleFieldChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
