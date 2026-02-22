import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { host } from "tests/config";

const SESSION = "app-test-session";
const BASE_URL = `http://${host}/${SESSION}`;

describe("アプリ作成API", () => {
  beforeEach(async () => {
    await fetch(`${BASE_URL}/initialize`, { method: "POST" });
  });

  afterEach(async () => {
    await fetch(`${BASE_URL}/finalize`, { method: "POST" });
  });

  test("アプリを作成するとIDとrevisionが返る", async () => {
    const response = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "テストアプリ" }),
    });
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.app).toEqual(expect.any(String));
    expect(data.revision).toBe("1");
  });

  test("複数回作成するとIDがインクリメントされる", async () => {
    const res1 = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "アプリ1" }),
    });
    const data1 = await res1.json();

    const res2 = await fetch(`${BASE_URL}/setup/app.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "アプリ2" }),
    });
    const data2 = await res2.json();

    expect(Number(data2.app)).toBeGreaterThan(Number(data1.app));
  });
});
