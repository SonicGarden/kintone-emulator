import { defineConfig, mergeConfig } from "vitest/config";

import sharedConfig from "../../vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    resolve: {
      tsconfigPaths: true,
    },
    test: {
      globalSetup: ["tests/global-setup.e2e.ts"],
      include: ["../core/tests/api/**/*.test.ts"],
      pool: "forks",
      maxWorkers: 1,
      isolate: false,
      env: { TEST_PORT: "12346" },
      alias: {
        "tests/": new URL("../core/tests/", import.meta.url).pathname,
      },
    },
  }),
);
