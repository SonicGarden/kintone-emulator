// CALC フィールド deploy 時バリデーションの API レベル検証。
// 実機の GAIA_IL01 / CB_VA01 形式のレスポンスが返ることを確認する。
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";
import { describeEmulatorOnly } from "../../real-kintone";

let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl("app-calc-validation-session");
});

describeEmulatorOnly("CALC / 文字列 autoCalc バリデーション", () => {
  let appId: number;

  beforeEach(async () => {
    await initializeSession(BASE_URL);
    appId = await createApp(BASE_URL, { name: "calc validation" });
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

  test("存在しないフィールドコード → GAIA_IL01", async () => {
    const res = await addFields({
      calc: { type: "CALC", code: "calc", label: "c", expression: "nonexistent + 1" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
    expect(body.message).toContain("フィールド「c」の計算式が正しくありません。");
    expect(body.message).toContain("計算式に含まれるフィールドコード（nonexistent）が存在しません。");
  });

  test("未知の関数 → GAIA_IL01", async () => {
    const res = await addFields({
      a: { type: "NUMBER", code: "a", label: "a" },
      calc: { type: "CALC", code: "calc", label: "c", expression: "FOOBAR(a)" },
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
    expect(body.message).toContain("FOOBAR関数は使用できません。");
  });

  test("引数不足 → GAIA_IL01", async () => {
    const res = await addFields({
      a: { type: "NUMBER", code: "a", label: "a" },
      calc: { type: "CALC", code: "calc", label: "c", expression: "IF(a)" },
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
    expect(body.message).toContain("IF関数には3個の引数が必要です。");
  });

  test("文法エラー → GAIA_IL01", async () => {
    const res = await addFields({
      a: { type: "NUMBER", code: "a", label: "a" },
      calc: { type: "CALC", code: "calc", label: "c", expression: "a +" },
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
    expect(body.message).toContain("計算式の文法が正しくありません。");
  });

  test("全角記号 → GAIA_IL01", async () => {
    const res = await addFields({
      a: { type: "NUMBER", code: "a", label: "a" },
      calc: { type: "CALC", code: "calc", label: "c", expression: "a ＋ 1" },
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
    expect(body.message).toContain("全角記号");
  });

  test("循環参照 → GAIA_IL01", async () => {
    const res = await addFields({
      calc_a: { type: "CALC", code: "calc_a", label: "a", expression: "calc_b + 1" },
      calc_b: { type: "CALC", code: "calc_b", label: "b", expression: "calc_a + 1" },
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
    expect(body.message).toContain("フィールドの参照が循環しています。");
  });

  test("参照不可タイプ → GAIA_IL01", async () => {
    const res = await addFields({
      ml: { type: "MULTI_LINE_TEXT", code: "ml", label: "ml" },
      calc: { type: "CALC", code: "calc", label: "c", expression: "ml + 1" },
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
    expect(body.message).toContain("計算式で利用できないフィールドタイプ");
  });

  test("不正な format → CB_VA01", async () => {
    const res = await addFields({
      a: { type: "NUMBER", code: "a", label: "a" },
      calc: { type: "CALC", code: "calc", label: "c", expression: "a", format: "CURRENCY" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("CB_VA01");
    expect(body.errors).toEqual({
      "properties[calc].format": { messages: ["Enum値のいずれかでなければなりません。"] },
    });
  });

  test("有効な CALC フィールドは追加できる", async () => {
    const res = await addFields({
      a: { type: "NUMBER", code: "a", label: "a" },
      b: { type: "NUMBER", code: "b", label: "b" },
      calc: { type: "CALC", code: "calc", label: "c", expression: "a + b", format: "NUMBER" },
    });
    expect(res.status).toBe(200);
  });

  test("SUBTABLE 内フィールドを SUM で参照できる", async () => {
    const res = await addFields({
      items: {
        type: "SUBTABLE", code: "items", label: "items",
        fields: {
          qty: { type: "NUMBER", code: "qty", label: "qty" },
        },
      },
      calc_sum: { type: "CALC", code: "calc_sum", label: "s", expression: "SUM(qty)" },
    });
    expect(res.status).toBe(200);
  });

  test("SINGLE_LINE_TEXT の expression も同様に検証される", async () => {
    const res = await addFields({
      a: { type: "NUMBER", code: "a", label: "a" },
      tc: { type: "SINGLE_LINE_TEXT", code: "tc", label: "tc", expression: "NOSUCH(a)" },
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
    expect(body.message).toContain("NOSUCH関数は使用できません。");
  });

  test("setup/app.json でも同様にバリデーションされる", async () => {
    await finalizeSession(BASE_URL);
    await initializeSession(BASE_URL);
    const res = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "calc bad app",
        properties: {
          calc: { type: "CALC", code: "calc", label: "c", expression: "nope + 1" },
        },
      }),
    });
    const body = await res.json();
    expect(body.code).toBe("GAIA_IL01");
  });
});
