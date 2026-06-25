import { test, expect } from "@playwright/test";

const SESSION = "pw-apps-portal-test";

test.beforeEach(async ({ request }) => {
  await request.post(`/${SESSION}/initialize`);
});

test.afterEach(async ({ request }) => {
  await request.post(`/${SESSION}/finalize`);
});

test("アプリ一覧ページが表示される", async ({ page }) => {
  await page.goto(`/${SESSION}/k/`);

  await expect(page).toHaveTitle("kintone emulator");
  await expect(page.getByText("アプリ一覧")).toBeVisible();
});

test("アプリが0件のとき空状態メッセージを表示する", async ({ page }) => {
  await page.goto(`/${SESSION}/k/`);

  await expect(page.getByText("アプリがありません")).toBeVisible();
});

test("作成したアプリがカードとして表示される", async ({ request, page }) => {
  await request.post(`/${SESSION}/setup/app.json`, {
    data: { name: "売上管理アプリ" },
  });
  await request.post(`/${SESSION}/setup/app.json`, {
    data: { name: "顧客管理アプリ" },
  });

  await page.goto(`/${SESSION}/k/`);

  await expect(page.getByText("売上管理アプリ")).toBeVisible();
  await expect(page.getByText("顧客管理アプリ")).toBeVisible();
});
