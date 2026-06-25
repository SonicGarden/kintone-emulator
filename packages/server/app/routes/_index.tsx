import { createTables } from "@sonicgarden/kintone-emulator/db/tables";
import { dbSession } from "@sonicgarden/kintone-emulator/db/client";
import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { Form, redirect } from "react-router";

export const meta: MetaFunction = () => [
  { title: "kintone emulator" },
  { name: "description", content: "kintone REST API のローカルエミュレーター" },
];

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const session = String(form.get("session") ?? "").trim();
  createTables(dbSession(session || undefined));
  return redirect(session ? `/${session}/k/` : `/k/`);
};

export default function Index() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-lg w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          kintone emulator
        </h1>
        <p className="text-gray-600 mb-6">
          kintone REST API のローカルエミュレーターです。
        </p>

        <Form method="post" className="flex gap-2 mb-6">
          <input
            type="text"
            name="session"
            placeholder="セッション名（省略可）"
            className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 whitespace-nowrap"
          >
            Initialize
          </button>
        </Form>

        <div className="bg-gray-50 rounded border border-gray-200 p-4 text-sm font-mono text-gray-700">
          <p className="mb-1">
            <span className="text-gray-400"># アプリ一覧を確認</span>
          </p>
          <p>/{"{"}session{"}"}/k/</p>
          <p className="mt-3 mb-1">
            <span className="text-gray-400"># API でセッション初期化</span>
          </p>
          <p>POST /{"{"}session{"}"}/initialize</p>
        </div>
      </div>
    </div>
  );
}
