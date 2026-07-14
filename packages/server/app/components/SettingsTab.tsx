import { Form } from "react-router";

type Props = {
  app: { id: number; name: string; revision: number };
};

export function SettingsTab({ app }: Props) {
  return (
    <>
      <section className="bg-white rounded border border-gray-200 p-6 mb-4">
        <h2 className="text-base font-medium text-gray-700 mb-4">アプリ名の変更</h2>
        <Form method="post" key={app.revision} className="flex gap-2">
          <input type="hidden" name="_method" value="PUT_APP" />
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
          <input type="hidden" name="_method" value="DELETE_APP" />
          <button
            type="submit"
            className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
          >
            削除する
          </button>
        </Form>
      </section>
    </>
  );
}
