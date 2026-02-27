import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ["tests/setup.e2e.ts"],
    include: ["../core/tests/api/**/*.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: { TEST_PORT: "12346" },
    alias: {
      "tests/": new URL("../core/tests/", import.meta.url).pathname,
    },
  },
});
