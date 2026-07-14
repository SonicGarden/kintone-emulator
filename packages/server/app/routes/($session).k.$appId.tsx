import { findApp, findCustomize } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import { findFields } from "@sonicgarden/kintone-emulator/db/fields";
import { findRecords } from "@sonicgarden/kintone-emulator/db/records";
import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, data, useLoaderData } from "react-router";
import { RecordListTable } from "../components/RecordListTable";
import { SiteHeader } from "../components/SiteHeader";

export const meta: MetaFunction = () => [{ title: "kintone emulator" }];

export const loader = ({ params }: LoaderFunctionArgs) => {
  try {
    const db = dbSession(params.session);
    const app = findApp(db, Number(params.appId));
    if (!app) throw data(null, { status: 404 });

    const fieldRows = findFields(db, app.id);
    const fields = fieldRows
      .map((row) => JSON.parse(row.body) as { type: string; code: string; label: string })
      .filter((f) => f.type !== "LABEL");

    const recordRows = findRecords(db, String(app.id));
    const records = recordRows.map((row) => ({
      id: row.id,
      body: JSON.parse(row.body) as Record<string, { value: unknown }>,
    }));

    const customize = findCustomize(db, app.id);
    const customizeJs = customize.desktop?.js ?? [];
    return { app, fields, records, customizeJs, session: params.session ?? null };
  } catch (e) {
    if (e instanceof Response || (e != null && typeof e === "object" && "status" in e)) throw e;
    throw data(null, { status: 404 });
  }
};

export default function AppRecordList() {
  const { app, fields, records, session } = useLoaderData<typeof loader>();

  useEffect(() => {
    window.__kintoneAppId = app.id;
    window.kintone?.events.fire("app.record.index.show", {
      type: "app.record.index.show",
      appId: app.id,
      viewId: 0,
      viewName: "default",
      viewType: "list",
      offset: 0,
      size: records.length,
      date: null,
      records: records.map((r) => r.body),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const listUrl = `/${session ? `${session}/` : ""}k/`;
  const formUrl = `/${session ? `${session}/` : ""}k/admin/app/flow?app=${app.id}#section=form`;
  const settingsUrl = `/${session ? `${session}/` : ""}k/admin/app/flow?app=${app.id}#section=settings`;

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader session={session} logoHref={listUrl}>
        <span className="text-sm text-gray-700 font-medium ml-2">{app.name}</span>
        <div className="gaia-argoui-app-menu ml-auto flex gap-3">
          <Link
            to={formUrl}
            className="text-xs text-gray-500 border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-50"
          >
            フォームの設定
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
        <div className="box-gaia">
          <div className="box-inner-gaia">
            <div className="view-list-data-gaia overflow-x-auto">
              <RecordListTable fields={fields} records={records} formUrl={formUrl} appId={app.id} session={session} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
