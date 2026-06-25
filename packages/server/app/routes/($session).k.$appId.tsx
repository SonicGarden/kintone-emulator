import { deleteApp, findApp, updateApp } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, data, redirect, useLoaderData } from "react-router";

export const meta: MetaFunction = () => [{ title: "kintone emulator" }];

export const loader = ({ params }: LoaderFunctionArgs) => {
  try {
    const db = dbSession(params.session);
    const app = findApp(db, Number(params.appId));
    if (!app) throw data(null, { status: 404 });
    return { app, session: params.session ?? null };
  } catch (e) {
    // data() で throw した 404 はそのまま再スロー
    if (e instanceof Response || (e != null && typeof e === "object" && "status" in e)) throw e;
    throw data(null, { status: 404 });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const db = dbSession(params.session);
  const appId = Number(params.appId);
  const form = await request.formData();
  const method = form.get("_method");
  const session = params.session;
  const listUrl = `/${session ? `${session}/` : ""}k/`;

  if (method === "DELETE") {
    deleteApp(db, appId);
    return redirect(listUrl);
  }

  const name = String(form.get("name") ?? "").trim();
  if (!name) return data({ error: "アプリ名を入力してください" }, { status: 400 });
  updateApp(db, appId, { name });
  return redirect(listUrl);
};

export default function AppDetail() {
  const { app, session } = useLoaderData<typeof loader>();
  const listUrl = `/${session ? `${session}/` : ""}k/`;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-300 px-6 py-3 flex items-center gap-4">
        <span className="text-lg font-semibold text-gray-800">kintone</span>
        {session && (
          <span className="text-sm text-gray-500">session: {session}</span>
        )}
      </header>

      <main className="px-6 py-6 max-w-xl">
        <Link to={listUrl} className="text-sm text-blue-600 hover:underline">
          ← アプリ一覧へ
        </Link>

        <h1 className="text-xl font-semibold text-gray-700 mt-4 mb-1">
          アプリ設定
        </h1>
        <p className="text-base text-gray-600 mb-1">{app.name}</p>
        <p className="text-sm text-gray-400 mb-6">アプリID: {app.id}</p>

        <section className="bg-white rounded border border-gray-200 p-6 mb-4">
          <h2 className="text-base font-medium text-gray-700 mb-4">アプリ名の変更</h2>
          <Form method="post" key={app.revision} className="flex gap-2">
            <input type="hidden" name="_method" value="PUT" />
            <input
              type="text"
              name="name"
              defaultValue={app.name}
              required
              className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
            >
              保存
            </button>
          </Form>
        </section>

        <section className="bg-white rounded border border-red-200 p-6">
          <h2 className="text-base font-medium text-red-600 mb-2">アプリの削除</h2>
          <p className="text-sm text-gray-500 mb-4">
            関連するレコード・フィールド・コメントもすべて削除されます。
          </p>
          <Form method="post">
            <input type="hidden" name="_method" value="DELETE" />
            <button
              type="submit"
              className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
            >
              削除する
            </button>
          </Form>
        </section>
      </main>
    </div>
  );
}
