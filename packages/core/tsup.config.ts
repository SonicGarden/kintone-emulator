import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/handlers/*.ts",
    "src/db/*.ts",
    "src/test-support/*.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
