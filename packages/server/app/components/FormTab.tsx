import { Form } from "react-router";
import { EditableLabel } from "./EditableLabel";

const FIELD_TYPES = [
  { value: "SINGLE_LINE_TEXT", label: "文字列（1行）" },
  { value: "LABEL", label: "ラベル" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  SINGLE_LINE_TEXT: "文字列（1行）",
  LABEL: "ラベル",
};

type Props = { fields: Record<string, unknown>[] };

export function FormTab({ fields }: Props) {
  return (
    <>
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
                  <span className="text-xs text-gray-400 font-mono truncate max-w-[120px]">{code}</span>
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
                <option key={f.value} value={f.value}>{f.label}</option>
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
    </>
  );
}
