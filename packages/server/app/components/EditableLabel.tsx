import { Form } from "react-router";

type Props = { appCode: string; currentLabel: string };

export function EditableLabel({ appCode, currentLabel }: Props) {
  return (
    <Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="_method" value="PATCH" />
      <input type="hidden" name="code" value={appCode} />
      <input
        type="text"
        name="label"
        defaultValue={currentLabel}
        className="border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-2 py-1 text-sm w-full outline-none"
        onBlur={(e) => {
          if (e.target.value !== currentLabel) {
            e.target.form?.requestSubmit();
          }
        }}
      />
    </Form>
  );
}
