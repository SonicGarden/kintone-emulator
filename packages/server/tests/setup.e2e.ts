import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { beforeAll, afterAll } from "vitest";

const PORT = process.env.TEST_PORT ?? "12346";
let serverProcess: ChildProcess;

beforeAll(async () => {
  serverProcess = spawn("node_modules/.bin/react-router-serve", ["./build/server/index.js"], {
    env: { ...process.env, PORT },
    stdio: ["pipe", "inherit", "inherit"],
  });

  await waitForServer(`http://localhost:${PORT}`);
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve) => {
    serverProcess.once("exit", () => resolve());
    serverProcess.kill();
  });
});

async function waitForServer(url: string, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const onExit = (code: number | null) => {
      reject(new Error(`Server process exited with code ${code} before becoming ready`));
    };
    serverProcess.once("exit", onExit);

    const poll = async (): Promise<void> => {
      if (Date.now() - start >= timeout) {
        serverProcess.off("exit", onExit);
        reject(new Error(`Server at ${url} did not start within ${timeout}ms`));
        return;
      }
      const res = await fetch(url).catch(() => null);
      if (res) {
        serverProcess.off("exit", onExit);
        resolve();
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
      await poll();
    };

    poll();
  });
}
