import crypto from "node:crypto";
import { deleteApp, findApp, findCustomize, updateApp, updateCustomize } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import {
  deleteFields,
  findFields,
  insertFields,
  updateField,
} from "@sonicgarden/kintone-emulator/db/fields";
import { insertFile } from "@sonicgarden/kintone-emulator/db/files";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, data, redirect, useLoaderData, useLocation } from "react-router";
import { CustomizeTab } from "../components/CustomizeTab";
import { FormTab } from "../components/FormTab";
import { SettingsTab } from "../components/SettingsTab";
import { SiteHeader } from "../components/SiteHeader";

export const meta: MetaFunction = () => [{ title: "アプリの設定 - kintone emulator" }];

const FIELD_TYPES = [
  { value: "SINGLE_LINE_TEXT", label: "文字列（1行）" },
  { value: "LABEL", label: "ラベル" },
] as const;

type FieldType = (typeof FIELD_TYPES)[number]["value"];

const buildFieldBody = (
  type: FieldType,
  code: string,
  label: string
): Record<string, unknown> & { type: string } => {
  if (type === "LABEL") {
    return { type, code, label, size: { width: "100" } };
  }
  return { type, code, label, defaultValue: "", maxLength: "", minLength: "", required: false, unique: false };
};

export const loader = ({ params, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const appId = Number(url.searchParams.get("app"));
  if (!appId) throw data(null, { status: 400 });

  try {
    const db = dbSession(params.session);
    const app = findApp(db, appId);
    if (!app) throw data(null, { status: 404 });
    const fieldRows = findFields(db, appId);
    const fields = fieldRows.map((row) => JSON.parse(row.body) as Record<string, unknown>);
    const customize = findCustomize(db, appId);
    return { app, fields, customize, session: params.session ?? null };
  } catch (e) {
    if (e instanceof Response || (e != null && typeof e === "object" && "status" in e)) throw e;
    throw data(null, { status: 404 });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const appId = Number(url.searchParams.get("app"));
  if (!appId) return data({ error: "app パラメータが必要です" }, { status: 400 });

  const db = dbSession(params.session);
  const form = await request.formData();
  const method = String(form.get("_method") ?? "");
  const session = params.session;

  // アプリ設定タブ
  if (method === "DELETE_APP") {
    deleteApp(db, appId);
    return redirect(`/${session ? `${session}/` : ""}k/`);
  }

  if (method === "PUT_APP") {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return data({ error: "アプリ名を入力してください" }, { status: 400 });
    updateApp(db, appId, { name });
    return redirect(request.url);
  }

  // カスタマイズタブ
  if (method === "ADD_CUSTOMIZE_URL") {
    const jsUrl = String(form.get("url") ?? "").trim();
    if (!jsUrl) return data({ error: "URLを入力してください" }, { status: 400 });
    const customize = findCustomize(db, appId);
    customize.desktop.js.push({ type: "URL", url: jsUrl });
    updateCustomize(db, appId, customize);
    return redirect(request.url);
  }

  if (method === "ADD_CUSTOMIZE_FILE") {
    const file = form.get("js_file") as File | null;
    if (!file || file.size === 0) return data({ error: "ファイルを選択してください" }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadKey = crypto.randomUUID();
    const downloadKey = crypto.randomBytes(24).toString("hex");
    insertFile(db, file.name, buffer, file.type || "application/javascript", uploadKey, downloadKey);
    const customize = findCustomize(db, appId);
    customize.desktop.js.push({ type: "FILE", file: { fileKey: downloadKey, name: file.name } });
    updateCustomize(db, appId, customize);
    return redirect(request.url);
  }

  if (method === "DELETE_CUSTOMIZE_JS") {
    const index = Number(form.get("index"));
    const customize = findCustomize(db, appId);
    customize.desktop.js.splice(index, 1);
    updateCustomize(db, appId, customize);
    return redirect(request.url);
  }

  // フォームタブ
  if (method === "DELETE") {
    const code = String(form.get("code") ?? "").trim();
    if (!code) return data({ error: "code が必要です" }, { status: 400 });
    deleteFields(db, appId, [code]);
    return redirect(request.url);
  }

  if (method === "PATCH") {
    const code = String(form.get("code") ?? "").trim();
    const label = String(form.get("label") ?? "").trim();
    if (!code || !label) return data({ error: "code と label が必要です" }, { status: 400 });
    updateField(db, appId, code, { label });
    return redirect(request.url);
  }

  // フィールド追加
  const type = String(form.get("type") ?? "") as FieldType;
  const code = String(form.get("code") ?? "").trim();
  const label = String(form.get("label") ?? "").trim();

  if (!type || !code || !label) {
    return data({ error: "種類・フィールドコード・ラベルを入力してください" }, { status: 400 });
  }
  if (!FIELD_TYPES.map((f) => f.value).includes(type)) {
    return data({ error: "不正なフィールド種類です" }, { status: 400 });
  }

  const existing = findFields(db, appId);
  if (existing.some((f) => f.code === code)) {
    return data({ error: `フィールドコード "${code}" はすでに使われています` }, { status: 400 });
  }

  insertFields(db, appId, { [code]: buildFieldBody(type, code, label) });
  return redirect(request.url);
};

const TABS = [
  { hash: "#section=form", label: "フォーム" },
  { hash: "#section=customize", label: "カスタマイズ" },
  { hash: "#section=settings", label: "設定" },
] as const;

type TabKey = "form" | "customize" | "settings";

const hashToTab = (hash: string): TabKey => {
  if (hash === "#section=settings") return "settings";
  if (hash === "#section=customize") return "customize";
  return "form";
};

export default function AppFormFlow() {
  const { app, fields, customize, session } = useLoaderData<typeof loader>();
  const location = useLocation();
  const activeTab = hashToTab(location.hash);

  const listUrl = `/${session ? `${session}/` : ""}k/`;
  const appDetailUrl = `/${session ? `${session}/` : ""}k/${app.id}/`;
  const baseUrl = `${location.pathname}${location.search}`;

  return (
    <div className="min-h-screen bg-gray-100">
      <SiteHeader session={session} logoHref={listUrl} />

      <main className="px-6 py-6 max-w-2xl">
        <nav className="text-sm text-gray-500 mb-4 flex gap-1">
          <Link to={listUrl} className="text-blue-600 hover:underline">アプリ一覧</Link>
          <span>/</span>
          <Link to={appDetailUrl} className="text-blue-600 hover:underline">{app.name}</Link>
          <span>/</span>
          <span>アプリの設定</span>
        </nav>

        <h1 className="text-xl font-semibold text-gray-700 mb-4">アプリの設定</h1>

        <div className="flex border-b border-gray-200 mb-6">
          {TABS.map((tab) => {
            const isActive = activeTab === hashToTab(tab.hash);
            return (
              <Link
                key={tab.hash}
                to={`${baseUrl}${tab.hash}`}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  isActive
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {activeTab === "form" && <FormTab fields={fields} />}
        {activeTab === "customize" && <CustomizeTab customizeJs={customize.desktop?.js ?? []} />}
        {activeTab === "settings" && <SettingsTab app={app} />}
      </main>
    </div>
  );
}
