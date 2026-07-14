import { test, expect, type APIRequestContext } from "@playwright/test";

const SESSION = "pw-kintone-events-test";

test.beforeEach(async ({ request }) => {
  await request.post(`/${SESSION}/initialize`);
});

test.afterEach(async ({ request }) => {
  await request.post(`/${SESSION}/finalize`);
});

/** アプリ作成 + JSカスタマイズ追加のヘルパー */
async function createAppWithCustomizeJs(
  request: APIRequestContext,
  jsContent: string,
  records?: Record<string, { value: string }>[]
): Promise<string> {
  const appRes = await request.post(`/${SESSION}/setup/app.json`, {
    data: {
      name: "カスタマイズテスト",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
        comment: { type: "SINGLE_LINE_TEXT", code: "comment", label: "コメント" },
      },
      ...(records ? { records } : {}),
    },
  });
  const { app: appId } = await appRes.json() as { app: string };

  // JSファイルをアップロード
  const fileRes = await request.post(`/${SESSION}/k/v1/file.json`, {
    multipart: {
      file: {
        name: "customize.js",
        mimeType: "application/javascript",
        buffer: Buffer.from(jsContent),
      },
    },
  });
  const { fileKey } = await fileRes.json() as { fileKey: string };

  // カスタマイズに追加
  await request.put(`/${SESSION}/k/v1/app/customize.json`, {
    data: {
      app: appId,
      desktop: {
        js: [{ type: "FILE", file: { fileKey, name: "customize.js" } }],
        css: [],
      },
      mobile: { js: [], css: [] },
    },
  });

  return appId;
}

test("edit.show イベントのハンドラがレコードフィールドを書き換える", async ({ request, page }) => {
  const js = `
    kintone.events.on('app.record.edit.show', function(event) {
      var record = event.record;
      record['comment'].value = 'こんにちは、' + record['title'].value;
      return event;
    });
  `;
  const appId = await createAppWithCustomizeJs(request, js, [
    { title: { value: "太郎" }, comment: { value: "" } },
  ]);

  await page.goto(`/${SESSION}/k/${appId}/show#record=1&mode=edit`);

  // カスタマイズJSが comment を「こんにちは、太郎」に書き換えるはず
  await expect(page.locator(`input[name="field:comment"]`)).toHaveValue("こんにちは、太郎", {
    timeout: 5000,
  });
});

test("edit.change.{code} イベントのハンドラがフィールド変更に連動する", async ({ request, page }) => {
  const js = `
    kintone.events.on('app.record.edit.change.title', function(event) {
      event.record['comment'].value = '変更後: ' + event.changes.field.value;
      return event;
    });
  `;
  const appId = await createAppWithCustomizeJs(request, js, [
    { title: { value: "初期値" }, comment: { value: "" } },
  ]);

  await page.goto(`/${SESSION}/k/${appId}/show#record=1&mode=edit`);

  // タイトルを変更すると comment が連動するはず
  await page.locator(`input[name="field:title"]`).fill("新しい値");

  await expect(page.locator(`input[name="field:comment"]`)).toHaveValue("変更後: 新しい値", {
    timeout: 5000,
  });
});

test("create.show イベントのハンドラが新規作成画面のフィールドを初期化する", async ({ request, page }) => {
  const js = `
    kintone.events.on('app.record.create.show', function(event) {
      event.record['comment'].value = 'デフォルトコメント';
      return event;
    });
  `;
  const appId = await createAppWithCustomizeJs(request, js);

  await page.goto(`/${SESSION}/k/${appId}/create`);

  await expect(page.locator(`input[name="field:comment"]`)).toHaveValue("デフォルトコメント", {
    timeout: 5000,
  });
});
