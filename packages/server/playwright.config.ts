import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.TEST_PORT ?? "12346";

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `PORT=${PORT} pnpm exec react-router-serve ./build/server/index.js`,
    port: Number(PORT),
    reuseExistingServer: false,
  },
});
