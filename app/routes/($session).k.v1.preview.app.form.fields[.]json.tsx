import { ActionFunctionArgs } from "@remix-run/node";
import { dbSession, serialize } from "~/utils/db.server";

const sql = `
INSERT INTO fields (app_id, type, code, label) VALUES (?, ?, ?, ?)
ON CONFLICT(code) DO UPDATE SET label = excluded.label, type = excluded.type
`

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
  const method = request.method;
  const db = dbSession(params.session);
  const url = new URL(request.url);
  switch (method) {
    case 'POST': {
      const requestData = await request.json();
      await serialize(db, () => {
        for (const key in requestData.properties) {
          db.run(sql, requestData.app, requestData.properties[key].type, key, requestData.properties.test.label);
        }
      });
      break;
    }
    case 'DELETE': {
      const hasQuery = url.search.length > 0;
      const json = hasQuery ? {} : await request.json();
      for (const [key, value] of url.searchParams.entries()) {
        if (key.includes('fields')) {
          json.fields = json.fields || [];
          json.fields.push(value);
        } else {
          json[key] = value;
        }
      }
      await serialize(db, () => {
        for (const code of json.fields) {
          db.run('DELETE FROM fields WHERE app_id = ? AND code = ?', json.app, code);
        }
      });
      break;
    }
  }
  return Response.json({ revision: 1 });
}
