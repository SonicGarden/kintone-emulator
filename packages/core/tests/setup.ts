import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll } from "vitest";
import { startServer } from "../src/server";

let server: Server;

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
