/// <reference types="vite/client" />
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { startServer } from "../src/server";
import {
  configureTestEnv,
  isUsingRealKintone,
  parseAppIds,
  parseSpaceApps,
  resetAppAssignment,
} from "../src/test-support";

// vitest の import.meta.env 経由で test-support に設定を注入する。
// （他プロジェクトからこのモジュール群を使う場合は自分で configureTestEnv を呼ぶ）
configureTestEnv({
  mode: import.meta.env.MODE,
  realKintone: {
    domain:   import.meta.env.VITE_KINTONE_TEST_DOMAIN ?? "",
    user:     import.meta.env.VITE_KINTONE_TEST_USER ?? "",
    password: import.meta.env.VITE_KINTONE_TEST_PASSWORD ?? "",
    appIds:         parseAppIds(import.meta.env.VITE_KINTONE_TEST_APP_IDS),
    spaceApps:      parseSpaceApps(import.meta.env.VITE_KINTONE_TEST_SPACE_APP_IDS),
    guestSpaceApps: parseSpaceApps(import.meta.env.VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS),
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
