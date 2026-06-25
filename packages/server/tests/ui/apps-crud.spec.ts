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

test("アプリカードをクリックすると詳細ページに遷移する", async ({ request, page }) => {
  await request.post(`/${SESSION}/setup/app.json`, { data: { name: "詳細テストアプリ" } });
  await page.goto(`/${SESSION}/k/`);
  await page.getByText("詳細テストアプリ").click();
  await expect(page.getByRole("heading", { name: "アプリ設定" })).toBeVisible();
});

test("アプリ名を編集できる", async ({ request, page }) => {
  await request.post(`/${SESSION}/setup/app.json`, { data: { name: "旧名前" } });
  await page.goto(`/${SESSION}/k/`);
  await page.getByText("旧名前").click();
  await page.locator('input[name="name"]').fill("新しい名前");
  await page.getByRole("button", { name: "保存" }).click();
  // 保存後は一覧ページへリダイレクトされ、更新されたアプリ名が表示される
  await page.waitForURL(`**/${SESSION}/k/`);
  await expect(page.getByText("新しい名前")).toBeVisible();
  await expect(page.getByText("旧名前")).not.toBeVisible();
});

test("アプリを削除すると一覧に戻りアプリが消える", async ({ request, page }) => {
  await request.post(`/${SESSION}/setup/app.json`, { data: { name: "削除対象アプリ" } });
  await page.goto(`/${SESSION}/k/`);
  await page.getByText("削除対象アプリ").click();
  await page.getByRole("button", { name: "削除する" }).click();
  await expect(page).toHaveURL(new RegExp(`/${SESSION}/k/$`));
  await expect(page.getByText("削除対象アプリ")).not.toBeVisible();
});
