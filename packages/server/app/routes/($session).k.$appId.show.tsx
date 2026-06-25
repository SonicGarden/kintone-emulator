import { findApp, findCustomize } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import { findFields } from "@sonicgarden/kintone-emulator/db/fields";
import { findRecord, updateRecord } from "@sonicgarden/kintone-emulator/db/records";
import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, data, redirect, useFetcher, useLoaderData, useLocation } from "react-router";
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

// kintone のシステムフィールドは UIから編集不可
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
  const recordId = form.get("record_id");
  if (!recordId || typeof recordId !== "string") throw data(null, { status: 400 });
  const prefix = params.session ? `${params.session}/` : "";

  const existing = findRecord(db, appId, recordId);
  if (!existing) throw data(null, { status: 404 });

  const existingBody = JSON.parse(existing.body) as Record<
    string,
    { value: unknown; type?: string } | undefined
  >;

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
    if (cell) {
      existingBody[code] = { ...cell, value: String(val) };
    }
  }

  updateRecord(db, appId, recordId, existingBody);
  return redirect(`/${prefix}k/${appId}/show#record=${recordId}&mode=show`);
};

type RecordBody = Record<string, { value: unknown } | undefined>;

function useHashRecord(prefix: string, appId: number) {
  const location = useLocation();
  // hash が空の場合（SSR）は null を返す
  const hash = location.hash.slice(1);
  const hashParams = new URLSearchParams(hash);
  const recordId = hashParams.get("record");
  const mode = hashParams.get("mode");

  const fetcher = useFetcher<{ record: RecordBody }>();

  useEffect(() => {
    if (!recordId) return;
    fetcher.load(`/${prefix}k/v1/record.json?app=${appId}&id=${recordId}`);
    // fetcher は依存に含めない（参照が変わっても再実行しない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, prefix, appId]);

  const record = fetcher.data?.record ?? null;
  const loading = fetcher.state === "loading";

  return { recordId, mode, record, loading };
}

export default function RecordShowPage() {
  const { app, fields, session } = useLoaderData<typeof loader>();
  const prefix = session ? `${session}/` : "";
  const { recordId, mode, record, loading } = useHashRecord(prefix, app.id);

  const listUrl = `/${prefix}k/${app.id}`;
  const settingsUrl = `/${prefix}k/admin/app/flow?app=${app.id}#section=settings`;
  const isEdit = mode === "edit";
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
                type="submit"
                form="record-edit-form"
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
            <Link
              to={editUrl}
              className="text-xs text-white bg-blue-600 rounded px-3 py-1 hover:bg-blue-700"
            >
              編集する
            </Link>
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
        <div className="mb-4">
          <Link to={listUrl} className="text-sm text-blue-600 hover:underline">
            ← 一覧に戻る
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
            {recordId && loading && (
              <p className="text-sm text-gray-400">読み込み中...</p>
            )}
            {recordId && !loading && !record && (
              <p className="text-sm text-red-500">レコードが見つかりませんでした。</p>
            )}
            {recordId && !loading && record && !isEdit && (
              <RecordDetailFields fields={fields} record={record} mode="show" />
            )}
            {recordId && !loading && record && isEdit && (
              <Form method="post" id="record-edit-form">
                <input type="hidden" name="record_id" value={recordId} />
                <RecordDetailFields fields={fields} record={record} mode="edit" />
              </Form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
