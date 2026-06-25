import { findApps, insertApp } from "@sonicgarden/kintone-emulator/db/apps";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useLoaderData } from "react-router";
import { AddAppForm } from "../components/AddAppForm";
import { AppCardGrid } from "../components/AppCardGrid";
import { SiteHeader } from "../components/SiteHeader";

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

  return (
    <div className="min-h-screen bg-gray-100">
      <SiteHeader session={session} logoHref={`/${session ? `${session}/` : ""}k/`} />
      <main className="px-6 py-6">
        <h1 className="text-xl font-semibold text-gray-700 mb-4">アプリ一覧</h1>
        <AppCardGrid apps={apps} session={session} />
        <AddAppForm />
      </main>
    </div>
  );
}
