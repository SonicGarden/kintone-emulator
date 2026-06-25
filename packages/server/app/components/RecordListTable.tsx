import { Link } from "react-router";

type Field = { type: string; code: string; label: string };
type Record = { id: number; body: { [code: string]: { value: unknown } | undefined } };

type Props = {
  fields: Field[];
  records: Record[];
  formUrl: string;
};

export function RecordListTable({ fields, records, formUrl }: Props) {
  if (fields.length === 0 && records.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">
        フィールドがありません。まず
        <Link to={formUrl} className="text-blue-600 hover:underline mx-1">
          フォームの設定
        </Link>
        でフィールドを追加してください。
      </p>
    );
  }

  return (
    <table className="recordlist-gaia recordlist-consistent-column-width-gaia w-full border-collapse text-sm">
      <thead>
        <tr className="bg-gray-100 border-b border-gray-300">
          <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">レコード番号</th>
          {fields.map((f) => (
            <th key={f.code} className="text-left px-3 py-2 font-medium text-gray-600 min-w-[120px]">
              {f.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.length === 0 ? (
          <tr>
            <td colSpan={fields.length + 1} className="px-3 py-6 text-center text-gray-400">
              レコードがありません
            </td>
          </tr>
        ) : (
          records.map((record) => (
            <tr key={record.id} className="border-b border-gray-200 hover:bg-blue-50 transition-colors">
              <td className="px-3 py-2 text-gray-500 tabular-nums">{record.id}</td>
              {fields.map((f) => {
                const cell = record.body[f.code];
                const value = cell?.value;
                return (
                  <td key={f.code} className="px-3 py-2 text-gray-700">
                    {value == null ? "" : String(value)}
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
