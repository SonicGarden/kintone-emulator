import { afterAll, beforeAll } from "vitest";
import { startServer } from "~/server";
import type { Server } from "node:http";

let server: Server;

beforeAll(async () => {
  server = await startServer(12345);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});
