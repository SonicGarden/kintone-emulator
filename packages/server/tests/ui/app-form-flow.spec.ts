import { test, expect } from "@playwright/test";

const SESSION = "pw-app-form-flow-test";

test.beforeEach(async ({ request }) => {
  await request.post(`/${SESSION}/initialize`);
});

test.afterEach(async ({ request }) => {
  await request.post(`/${SESSION}/finalize`);
});

test("フォームタブがデフォルトで表示される", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "タブテスト" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/admin/app/flow?app=${appId}`);
  await expect(page.getByRole("heading", { name: "フィールドを追加" })).toBeVisible();
});

test("設定タブに切り替えられる", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "タブ切り替えテスト" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/admin/app/flow?app=${appId}#section=form`);
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "アプリ名の変更" })).toBeVisible();
});

test("フォームタブに切り替えられる", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "フォームタブテスト" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/admin/app/flow?app=${appId}#section=settings`);
  await page.getByRole("link", { name: "フォーム" }).click();
  await expect(page.getByRole("heading", { name: "フィールドを追加" })).toBeVisible();
});

test("フィールドを追加できる", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "フィールド追加テスト" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/admin/app/flow?app=${appId}#section=form`);
  await page.locator('input[name="code"]').fill("my_field");
  await page.locator('input[name="label"]').fill("マイフィールド");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByText("マイフィールド")).toBeVisible();
  await expect(page.getByText("my_field")).toBeVisible();
});

test("フィールドを削除できる", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, {
    data: {
      name: "フィールド削除テスト",
      properties: {
        del_field: { type: "SINGLE_LINE_TEXT", code: "del_field", label: "削除対象フィールド" },
      },
    },
  });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/admin/app/flow?app=${appId}#section=form`);
  await expect(page.getByText("削除対象フィールド")).toBeVisible();
  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.getByText("削除対象フィールド")).not.toBeVisible();
});
