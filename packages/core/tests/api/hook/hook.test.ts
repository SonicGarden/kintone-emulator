import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createKintoneStub } from "../../../src/hook-test";
import { createApp, createBaseUrl, finalizeSession, initializeSession } from "../../helpers";

const SESSION = "hook-test";
let BASE_URL: string;

beforeAll(() => {
  BASE_URL = createBaseUrl(SESSION);
});

beforeEach(() => initializeSession(BASE_URL));
afterEach(() => finalizeSession(BASE_URL));

test("kintone.events.on で登録したハンドラーが fire で実行される", async () => {
  const stub = createKintoneStub();

  stub.events.on("app.record.create.submit", (event) => {
    return { ...event, record: { ...event.record, processed: { type: "SINGLE_LINE_TEXT", value: "yes" } } };
  });

  const result = await stub.events.fire("app.record.create.submit", {
    record: { name: { type: "SINGLE_LINE_TEXT", value: "test" } },
  });

  expect(result).not.toBe(false);
  if (result !== false) {
    expect(result.record["processed"]?.value).toBe("yes");
  }
});

test("ハンドラーが error を返すとチェーンが中断される", async () => {
  const stub = createKintoneStub();
  const secondHandler = vi.fn();

  stub.events.on("app.record.create.submit", (event) => {
    return { ...event, error: "入力エラーです" };
  });
  stub.events.on("app.record.create.submit", secondHandler);

  const result = await stub.events.fire("app.record.create.submit", {
    record: { name: { type: "SINGLE_LINE_TEXT", value: "" } },
  });

  expect(result).not.toBe(false);
  if (result !== false) {
    expect(result.error).toBe("入力エラーです");
  }
  expect(secondHandler).not.toHaveBeenCalled();
});

test("ハンドラーが false を返すとキャンセルになる", async () => {
  const stub = createKintoneStub();

  stub.events.on("app.record.delete.submit", () => false);

  const result = await stub.events.fire("app.record.delete.submit", {
    record: {},
  });

  expect(result).toBe(false);
});

test("ハンドラーが undefined を返すと分かりやすいエラーになる", async () => {
  const stub = createKintoneStub();

  // return を書き忘れたカスタマイズコードの模倣
  stub.events.on("app.record.create.submit", (_event) => {
    // return を書き忘れ → undefined
    return undefined as never;
  });

  await expect(
    stub.events.fire("app.record.create.submit", { record: {} }),
  ).rejects.toThrow("undefined を返しました");
});

test("複数イベント名を配列で登録できる", async () => {
  const stub = createKintoneStub();
  const handler = vi.fn((event) => event);

  stub.events.on(["app.record.create.submit", "app.record.edit.submit"], handler);

  await stub.events.fire("app.record.create.submit", { record: {} });
  await stub.events.fire("app.record.edit.submit", { record: {} });

  expect(handler).toHaveBeenCalledTimes(2);
});

test("events.off でハンドラーを解除できる", async () => {
  const stub = createKintoneStub();
  const handler = vi.fn((event) => event);

  stub.events.on("app.record.create.submit", handler);
  stub.events.off("app.record.create.submit", handler);

  await stub.events.fire("app.record.create.submit", { record: {} });

  expect(handler).not.toHaveBeenCalled();
});

test("app.record.get / set でフォームデータを操作できる", () => {
  const stub = createKintoneStub();

  stub.app.record.set({ record: { title: { type: "SINGLE_LINE_TEXT", value: "hello" } } });

  const { record } = stub.app.record.get();
  expect(record["title"]?.value).toBe("hello");
});

test("kintone.api() でエミュレーターの REST API を呼べる", async () => {
  const stub = createKintoneStub({ baseUrl: BASE_URL });

  const { appId } = await createApp(BASE_URL, {
    name: "hook-api-test",
    properties: {
      title: { type: "SINGLE_LINE_TEXT", code: "title", label: "Title" },
    },
  });

  stub.events.on("app.record.create.submit", async (event) => {
    await stub.api("/k/v1/record.json", "POST", {
      app: appId,
      record: { title: { value: "api-created" } },
    });
    return event;
  });

  await stub.events.fire("app.record.create.submit", { record: {} });

  const response = (await stub.api("/k/v1/records.json", "GET", {
    app: appId,
    query: 'title = "api-created"',
  })) as { records: unknown[] };

  expect(response.records).toHaveLength(1);
});

test("kintone.api.url() でパスに .json が付与される", () => {
  const stub = createKintoneStub();
  expect(stub.api.url("/k/v1/records")).toBe("/k/v1/records.json");
  expect(stub.api.url("/k/v1/record")).toBe("/k/v1/record.json");
});

test("kintone.api.url() 経由で REST API を呼べる", async () => {
  const stub = createKintoneStub({ baseUrl: BASE_URL });

  const { appId } = await createApp(BASE_URL, {
    name: "api-url-test",
    properties: {
      name: { type: "SINGLE_LINE_TEXT", code: "name", label: "名前" },
    },
    records: [{ name: { value: "田中" } }, { name: { value: "鈴木" } }],
  });

  stub._setAppId(appId);

  const response = (await stub.api(
    stub.api.url("/k/v1/records"),
    "GET",
    { app: appId },
  )) as { records: unknown[] };

  expect(response.records).toHaveLength(2);
});

test("_setQuery / getQuery でクエリ文字列を制御できる", () => {
  const stub = createKintoneStub();

  stub._setQuery('name = "田中" order by $id desc limit 100');

  expect(stub.app.getQuery()).toBe('name = "田中" order by $id desc limit 100');
  expect(stub.app.getQueryCondition()).toBe('name = "田中"');
});

test("getHeaderMenuSpaceElement で追加した要素を検証できる", async () => {
  const stub = createKintoneStub();

  stub.events.on("app.record.index.show", (event) => {
    const button = { id: "my-button", type: "BUTTON" };
    stub.app.getHeaderMenuSpaceElement().appendChild(button);
    return event;
  });

  await stub.events.fire("app.record.index.show", { record: {} });

  const headerSpace = stub.app.getHeaderMenuSpaceElement();
  expect(headerSpace.children).toHaveLength(1);
  expect(headerSpace.children[0]).toMatchObject({ id: "my-button" });
});

test("カスタマイズコードに kintone スタブを渡してテストできる", async () => {
  const stub = createKintoneStub();

  // 実際の利用では import したカスタマイズモジュールの setup 関数に stub を渡す
  // ここではインラインで同等のコードを実行
  const setupCustomization = (kintone: typeof stub) => {
    kintone.events.on("app.record.create.submit", (event) => {
      if (!event.record["name"]?.value) {
        return { ...event, error: "名前は必須です" };
      }
      return event;
    });
  };

  setupCustomization(stub);

  const result = await stub.events.fire("app.record.create.submit", {
    record: { name: { type: "SINGLE_LINE_TEXT", value: "" } },
  });

  expect(result).not.toBe(false);
  if (result !== false) {
    expect(result.error).toBe("名前は必須です");
  }
});
