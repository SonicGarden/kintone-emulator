import { test, expect } from "@playwright/test";

const SESSION = "pw-record-list-test";

test.beforeEach(async ({ request }) => {
  await request.post(`/${SESSION}/initialize`);
});

test.afterEach(async ({ request }) => {
  await request.post(`/${SESSION}/finalize`);
});

test("フィールドもレコードもない場合にフォーム設定への誘導メッセージが表示される", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "空アプリ" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/${appId}/`);
  await expect(page.getByText("フォームの設定")).toBeVisible();
});

test("フィールドがある場合に列ヘッダーが表示される", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, {
    data: {
      name: "列ヘッダーテスト",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
    },
  });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/${appId}/`);
  await expect(page.getByRole("columnheader", { name: "タイトル" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "レコード番号" })).toBeVisible();
});

test("レコードがある場合に値が行として表示される", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, {
    data: {
      name: "レコード表示テスト",
      properties: {
        title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
      },
      records: [
        { title: { value: "サンプルレコード" } },
      ],
    },
  });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/${appId}/`);
  await expect(page.getByRole("cell", { name: "サンプルレコード" })).toBeVisible();
});

test("レコードはあるがフィールドがない場合に「レコードがありません」と表示される", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "フィールドなしアプリ" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/${appId}/`);
  await expect(page.getByText("フィールドがありません")).toBeVisible();
});

test("ヘッダーのアプリ設定ボタンから設定タブに遷移できる", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "ナビテスト" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/${appId}/`);
  await page.locator(".gaia-argoui-app-menu-settings").click();
  await expect(page).toHaveURL(new RegExp(`app=${appId}#section=settings`));
});
