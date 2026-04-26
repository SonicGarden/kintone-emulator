// LOOKUP フィールドの deploy 時バリデーション。
// fieldMappings[].field が同一リクエスト内 + 既存フィールドのいずれにも
// 存在しなければ実機は GAIA_FC01 を返す。並び順自体は影響しない。
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("app-lookup-validation-session");
});

describeEmulatorOnly("LOOKUP fieldMappings の存在チェック", () => {
  let appId: number;

  beforeEach(async () => {
    await initializeSession(BASE_URL);
    appId = (await createApp(BASE_URL, { name: "lookup validation" })).appId;
  });

  afterEach(async () => {
    await finalizeSession(BASE_URL);
  });

  const addFields = (properties: Record<string, unknown>) =>
    fetch(`${BASE_URL}/k/v1/preview/app/form/fields.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Cybozu-API-Token": "test" },
      body: JSON.stringify({ app: appId, properties }),
    });

  const lookupDef = (mapping: string) => ({
    type: "SINGLE_LINE_TEXT", code: "master_code", label: "mc",
    lookup: {
      relatedApp: { app: "999" }, relatedKeyField: "code",
      fieldMappings: [{ field: mapping, relatedField: "name" }],
      lookupPickerFields: [], filterCond: "", sort: "",
    },
  });

  test("fieldMappings.field が同一リクエスト内に無いと GAIA_FC01", async () => {
    const res = await addFields({
      master_code: lookupDef("missing_dest"),
      // missing_dest を意図的に含めない
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("GAIA_FC01");
    expect(body.message).toContain("指定されたフィールド（code: missing_dest）が見つかりません");
  });

  test("fieldMappings.field が同一リクエストにあれば順序問わず OK", async () => {
    const res = await addFields({
      master_code: lookupDef("dest_name"),
      dest_name: { type: "SINGLE_LINE_TEXT", code: "dest_name", label: "dn" },
    });
    expect(res.status).toBe(200);
  });

  test("既に deploy 済みのフィールドを fieldMappings で参照できる", async () => {
    // Stage A: dest を先に deploy
    const r1 = await addFields({
      dest_name: { type: "SINGLE_LINE_TEXT", code: "dest_name", label: "dn" },
    });
    expect(r1.status).toBe(200);
    // Stage B: lookup だけ後追い
    const r2 = await addFields({ master_code: lookupDef("dest_name") });
    expect(r2.status).toBe(200);
  });

  test("Accept-Language: en で英語メッセージ", async () => {
    const res = await fetch(`${BASE_URL}/k/v1/preview/app/form/fields.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cybozu-API-Token": "test",
        "Accept-Language": "en",
      },
      body: JSON.stringify({
        app: appId,
        properties: { master_code: lookupDef("missing_dest") },
      }),
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_FC01");
    expect(body.message).toBe("The specified field (code: missing_dest) is not found.");
  });
});
