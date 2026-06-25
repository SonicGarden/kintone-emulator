import { findApp } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import {
  deleteFields,
  findFields,
  insertFields,
  updateField,
} from "@sonicgarden/kintone-emulator/db/fields";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { Form, Link, data, redirect, useLoaderData } from "react-router";

export const meta: MetaFunction = () => [{ title: "フォームの設定 - kintone emulator" }];

const FIELD_TYPES = [
  { value: "SINGLE_LINE_TEXT", label: "文字列（1行）" },
  { value: "LABEL", label: "ラベル" },
] as const;

type FieldType = (typeof FIELD_TYPES)[number]["value"];

const buildFieldBody = (type: FieldType, code: string, label: string): Record<string, unknown> & { type: string } => {
  if (type === "LABEL") {
    return { type, code, label, size: { width: "100" } };
  }
  return {
    type,
    code,
    label,
    defaultValue: "",
    maxLength: "",
    minLength: "",
    required: false,
    unique: false,
  };
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
    return { app, fields, session: params.session ?? null };
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

  // ADD
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

const TYPE_LABELS: Record<string, string> = {
  SINGLE_LINE_TEXT: "文字列（1行）",
  LABEL: "ラベル",
};

export default function AppFormFlow() {
  const { app, fields, session } = useLoaderData<typeof loader>();
  const appDetailUrl = `/${session ? `${session}/` : ""}k/${app.id}/`;
  const listUrl = `/${session ? `${session}/` : ""}k/`;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-300 px-6 py-3 flex items-center gap-4">
        <span className="text-lg font-semibold text-gray-800">kintone</span>
        {session && <span className="text-sm text-gray-500">session: {session}</span>}
      </header>

      <main className="px-6 py-6 max-w-2xl">
        <nav className="text-sm text-gray-500 mb-4 flex gap-1">
          <Link to={listUrl} className="text-blue-600 hover:underline">
            アプリ一覧
          </Link>
          <span>/</span>
          <Link to={appDetailUrl} className="text-blue-600 hover:underline">
            {app.name}
          </Link>
          <span>/</span>
          <span>フォームの設定</span>
        </nav>

        <h1 className="text-xl font-semibold text-gray-700 mb-6">フォームの設定</h1>

        {/* フィールド一覧 */}
        <section className="bg-white rounded border border-gray-200 mb-6">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-medium text-gray-700">フィールド一覧</h2>
          </div>

          {fields.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">フィールドがありません</p>
          ) : (
            <ul>
              {fields.map((field, i) => {
                const code = String(field.code ?? "");
                const label = String(field.label ?? "");
                const type = String(field.type ?? "");
                return (
                  <li
                    key={code}
                    className={`flex items-center gap-3 px-4 py-3 ${i !== 0 ? "border-t border-gray-100" : ""}`}
                  >
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono whitespace-nowrap">
                      {TYPE_LABELS[type] ?? type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <EditableLabel appCode={code} currentLabel={label} />
                    </div>
                    <span className="text-xs text-gray-400 font-mono truncate max-w-[120px]">
                      {code}
                    </span>
                    <Form method="post">
                      <input type="hidden" name="_method" value="DELETE" />
                      <input type="hidden" name="code" value={code} />
                      <button
                        type="submit"
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                      >
                        削除
                      </button>
                    </Form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* フィールド追加 */}
        <section className="bg-white rounded border border-gray-200 p-5">
          <h2 className="text-base font-medium text-gray-700 mb-4">フィールドを追加</h2>
          <Form method="post" className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 items-end">
            <div>
              <label htmlFor="field-type" className="block text-xs text-gray-500 mb-1">種類</label>
              <select
                id="field-type"
                name="type"
                className="border border-gray-300 rounded px-2 py-2 text-sm"
                defaultValue="SINGLE_LINE_TEXT"
              >
                {FIELD_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="field-code" className="block text-xs text-gray-500 mb-1">フィールドコード</label>
              <input
                id="field-code"
                type="text"
                name="code"
                required
                placeholder="field_code"
                className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label htmlFor="field-label" className="block text-xs text-gray-500 mb-1">ラベル</label>
              <input
                id="field-label"
                type="text"
                name="label"
                required
                placeholder="フィールド名"
                className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
            >
              追加
            </button>
          </Form>
        </section>
      </main>
    </div>
  );
}

function EditableLabel({ appCode, currentLabel }: { appCode: string; currentLabel: string }) {
  return (
    <Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="_method" value="PATCH" />
      <input type="hidden" name="code" value={appCode} />
      <input
        type="text"
        name="label"
        defaultValue={currentLabel}
        className="border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-2 py-1 text-sm w-full outline-none"
        onBlur={(e) => {
          if (e.target.value !== currentLabel) {
            e.target.form?.requestSubmit();
          }
        }}
      />
    </Form>
  );
}
