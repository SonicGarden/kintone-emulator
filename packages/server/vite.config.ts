import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    external: ["better-sqlite3"],
  },
  server: {
    port: 12345,
    cors: {
      origin: false,
      preflightContinue: true,
    },
  },
});
