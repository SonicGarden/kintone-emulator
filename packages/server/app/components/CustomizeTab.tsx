import type { JsItem } from "@sonicgarden/kintone-emulator/db/apps";
import { Form } from "react-router";

type Props = { customizeJs: JsItem[] };

export function CustomizeTab({ customizeJs }: Props) {
  return (
    <>
      <section className="bg-white rounded border border-gray-200 mb-6">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-medium text-gray-700">JavaScript（PC用）</h2>
        </div>

        {customizeJs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">登録されているJavaScriptファイルはありません</p>
        ) : (
          <ul>
            {customizeJs.map((item, i) => (
              <li key={i} className={`flex items-center gap-3 px-4 py-3 ${i !== 0 ? "border-t border-gray-100" : ""}`}>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                  {item.type === "URL" ? "URL" : "FILE"}
                </span>
                <span className="flex-1 text-sm text-gray-700 font-mono truncate">
                  {item.type === "URL" ? item.url : item.file.name}
                </span>
                <Form method="post">
                  <input type="hidden" name="_method" value="DELETE_CUSTOMIZE_JS" />
                  <input type="hidden" name="index" value={String(i)} />
                  <button
                    type="submit"
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                  >
                    削除
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded border border-gray-200 p-5 mb-4">
        <h2 className="text-base font-medium text-gray-700 mb-4">URLで追加</h2>
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="_method" value="ADD_CUSTOMIZE_URL" />
          <input
            type="url"
            name="url"
            required
            placeholder="https://example.com/script.js"
            className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 whitespace-nowrap"
          >
            追加
          </button>
        </Form>
      </section>

      <section className="bg-white rounded border border-gray-200 p-5">
        <h2 className="text-base font-medium text-gray-700 mb-4">ファイルをアップロード</h2>
        <Form method="post" encType="multipart/form-data" className="flex gap-2">
          <input type="hidden" name="_method" value="ADD_CUSTOMIZE_FILE" />
          <input
            type="file"
            name="js_file"
            accept=".js,application/javascript,text/javascript"
            required
            className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 whitespace-nowrap"
          >
            アップロード
          </button>
        </Form>
      </section>
    </>
  );
}
