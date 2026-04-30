import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PORT = process.env.TEST_PORT ?? "12346";
const LOG_FILE = resolve("tmp/e2e-server.log");

export default async function setup() {
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  const logStream = createWriteStream(LOG_FILE, { flags: "w" });

  const serverProcess = spawn(
    "node_modules/.bin/react-router-serve",
    ["./build/server/index.js"],
    {
      env: { ...process.env, PORT },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  serverProcess.stdout?.pipe(logStream);
  serverProcess.stderr?.pipe(logStream);

  // eslint-disable-next-line no-console
  console.log(`[e2e] react-router-serve logs → ${LOG_FILE}`);

  await waitForServer(`http://localhost:${PORT}`, serverProcess);

  return async () => {
    await new Promise<void>((resolve) => {
      serverProcess.once("exit", () => resolve());
      serverProcess.kill();
    });
  };
}

async function waitForServer(
  url: string,
  serverProcess: ChildProcess,
  timeout = 30000
): Promise<void> {
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
