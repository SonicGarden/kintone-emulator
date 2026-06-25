import { findApps, insertApp } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, data, redirect, useLoaderData } from "react-router";

export const meta: MetaFunction = () => [{ title: "kintone emulator" }];

export const loader = ({ params }: LoaderFunctionArgs) => {
  try {
    const db = dbSession(params.session);
    const apps = findApps(db, { limit: 100, offset: 0 });
    return { apps, session: params.session ?? null };
  } catch {
    // initialize 前にアクセスされた場合（テーブルが存在しない）
    return { apps: [], session: params.session ?? null };
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const db = dbSession(params.session);
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return data({ error: "アプリ名を入力してください" }, { status: 400 });
  insertApp(db, { name, layout: "[]" });
  const session = params.session;
  return redirect(`/${session ? `${session}/` : ""}k/`);
};

export default function KintonePortal() {
  const { apps, session } = useLoaderData<typeof loader>();
  const appUrl = (appId: number) => `/${session ? `${session}/` : ""}k/${appId}/`;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-300 px-6 py-3 flex items-center gap-4">
        <span className="text-lg font-semibold text-gray-800">kintone</span>
        {session && (
          <span className="text-sm text-gray-500">session: {session}</span>
        )}
      </header>

      <main className="px-6 py-6">
        <h1 className="text-xl font-semibold text-gray-700 mb-4">
          アプリ一覧
        </h1>

        {apps.length === 0 ? (
          <p className="text-gray-500">アプリがありません</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {apps.map((app) => (
              <Link
                key={app.id}
                to={appUrl(app.id)}
                className="bg-white rounded border border-gray-200 p-4 hover:shadow-sm transition-shadow block"
              >
                <div className="text-base font-medium text-gray-800 truncate">
                  {app.name}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  アプリID: {app.id}
                </div>
              </Link>
            ))}
          </div>
        )}

        <Form method="post" className="mt-6 flex gap-2 max-w-sm">
          <input
            type="text"
            name="name"
            placeholder="アプリ名"
            required
            className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            アプリを追加
          </button>
        </Form>
      </main>
    </div>
  );
}
