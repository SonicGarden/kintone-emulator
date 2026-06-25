import { test, expect } from "@playwright/test";

const SESSION = "pw-apps-crud-test";

test.beforeEach(async ({ request }) => {
  await request.post(`/${SESSION}/initialize`);
});

test.afterEach(async ({ request }) => {
  await request.post(`/${SESSION}/finalize`);
});

test("アプリ作成フォームで新規アプリを追加できる", async ({ page }) => {
  await page.goto(`/${SESSION}/k/`);
  await page.getByPlaceholder("アプリ名").fill("テストアプリ");
  await page.getByRole("button", { name: "アプリを追加" }).click();
  await expect(page.getByText("テストアプリ")).toBeVisible();
});

test("アプリカードをクリックするとレコード一覧ページに遷移する", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "詳細テストアプリ" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/`);
  await page.getByText("詳細テストアプリ").click();
  await expect(page).toHaveURL(new RegExp(`/${SESSION}/k/${appId}`));
});

test("アプリ名を編集できる", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "旧名前" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/admin/app/flow?app=${appId}#section=settings`);
  await page.locator('input[name="name"]').fill("新しい名前");
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(`**/${SESSION}/k/`);
  await expect(page.getByText("新しい名前")).toBeVisible();
  await expect(page.getByText("旧名前")).not.toBeVisible();
});

test("アプリを削除すると一覧に戻りアプリが消える", async ({ request, page }) => {
  const res = await request.post(`/${SESSION}/setup/app.json`, { data: { name: "削除対象アプリ" } });
  const { app: appId } = await res.json() as { app: string };
  await page.goto(`/${SESSION}/k/admin/app/flow?app=${appId}#section=settings`);
  await page.getByRole("button", { name: "削除する" }).click();
  await expect(page).toHaveURL(new RegExp(`/${SESSION}/k/$`));
  await expect(page.getByText("削除対象アプリ")).not.toBeVisible();
});
