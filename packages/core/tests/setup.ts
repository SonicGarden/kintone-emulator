/// <reference types="vite/client" />
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { startServer } from "../src/server";
import { configureTestEnv, isUsingRealKintone, resetAppAssignment } from "../src/test-support";

// vitest の import.meta.env 経由で test-support に設定を注入する。
// （他プロジェクトからこのモジュール群を使う場合は自分で configureTestEnv を呼ぶ）
const parseSpaceApps = (raw: string) =>
  raw
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
    .map((entry: string) => {
      const [spaceId, appId] = entry.split(":").map(Number);
      return { spaceId: spaceId!, appId: appId! };
    })
    .filter((e) => Number.isFinite(e.spaceId) && e.spaceId > 0 && Number.isFinite(e.appId) && e.appId > 0);

configureTestEnv({
  mode: import.meta.env.MODE,
  realKintone: {
    domain:   import.meta.env.VITE_KINTONE_TEST_DOMAIN ?? "",
    user:     import.meta.env.VITE_KINTONE_TEST_USER ?? "",
    password: import.meta.env.VITE_KINTONE_TEST_PASSWORD ?? "",
    appIds:   (import.meta.env.VITE_KINTONE_TEST_APP_IDS ?? "")
      .split(",")
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => Number.isFinite(n) && n > 0),
    spaceApps:      parseSpaceApps(import.meta.env.VITE_KINTONE_TEST_SPACE_APP_IDS ?? ""),
    guestSpaceApps: parseSpaceApps(import.meta.env.VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS ?? ""),
  },
});

let server: Server;

if (!isUsingRealKintone()) {
  beforeAll(async () => {
    server = await startServer();
    const { port } = server.address() as AddressInfo;
    process.env.TEST_PORT = String(port);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
}

// 各テスト前に実 kintone のアプリ ID プール割り当てを先頭に戻す
// （emulator モードでも呼んでおくと、プールを使う移行後テストがどちらでも動く）
beforeEach(() => {
  resetAppAssignment();
});
