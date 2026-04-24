import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { startServer } from "../src/server";
import { isUsingRealKintone, resetAppAssignment } from "./real-kintone";

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
