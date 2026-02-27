import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    alias: {
      "tests/": new URL("./tests/", import.meta.url).pathname,
    },
  },
});
