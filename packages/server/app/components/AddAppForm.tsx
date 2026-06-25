import { Form } from "react-router";

export function AddAppForm() {
  return (
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
  );
}
