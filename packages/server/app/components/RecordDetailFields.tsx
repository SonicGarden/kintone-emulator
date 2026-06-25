type Field = { type: string; code: string; label: string };
type RecordBody = Record<string, { value: unknown } | undefined>;

type Props = {
  fields: Field[];
  record: RecordBody;
  mode: "show" | "edit" | "create";
  onFieldChange?: (code: string, value: string) => void;
};

const READONLY_FIELD_TYPES = new Set([
  "__ID__", "__REVISION__", "RECORD_NUMBER",
  "CREATOR", "MODIFIER", "CREATED_TIME", "UPDATED_TIME",
  "CALC", "SUBTABLE", "FILE",
]);

export function RecordDetailFields({ fields, record, mode, onFieldChange }: Props) {
  return (
    <dl className="divide-y divide-gray-100">
      {fields.map((field) => {
        const cell = record[field.code];
        const value = cell?.value;

        if (field.type === "LABEL") {
          return (
            <div key={field.code} className="py-3">
              <span className="text-sm font-semibold text-gray-600">{field.label}</span>
            </div>
          );
        }

        const isEditable = mode !== "show" && !READONLY_FIELD_TYPES.has(field.type);
        return (
          <div key={field.code} className="grid grid-cols-[180px_1fr] py-3 gap-4 items-start">
            <dt className="text-sm font-medium text-gray-500 pt-1">{field.label}</dt>
            <dd>
              {isEditable && onFieldChange ? (
                <input
                  type="text"
                  name={`field:${field.code}`}
                  value={value == null ? "" : String(value)}
                  onChange={(e) => onFieldChange(field.code, e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:border-blue-400"
                />
              ) : isEditable ? (
                <input
                  type="text"
                  name={`field:${field.code}`}
                  defaultValue={value == null ? "" : String(value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:border-blue-400"
                />
              ) : (
                <span className="text-sm text-gray-800">
                  {value == null || value === "" ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    String(value)
                  )}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
