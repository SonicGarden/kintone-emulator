import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// 実 kintone モードでは deploy が 5-10 秒かかるため、タイムアウトを大きめに取る
const isRealKintoneMode = process.env.USE_REAL_KINTONE === "1";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: isRealKintoneMode ? 30_000 : 5_000,
    hookTimeout: isRealKintoneMode ? 60_000 : 10_000,
    alias: {
      "tests/": new URL("./tests/", import.meta.url).pathname,
    },
  },
});
