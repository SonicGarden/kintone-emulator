import { defineConfig } from "vitest/config";

// vitest/vite のデフォルト挙動で `.env.<mode>` から VITE_ プレフィックス付きの
// 環境変数がロードされ、`import.meta.env` 経由でアクセスできる。
// `--mode real-kintone` で packages/core/.env.real-kintone を読む。
export default defineConfig(({ mode }) => {
  const isRealKintoneMode = mode === "real-kintone";
  return {
    resolve: {
      tsconfigPaths: true,
    },
    test: {
      setupFiles: ["tests/setup.ts"],
      pool: "forks",
      maxWorkers: 1,
      isolate: false,
      // 実 kintone モードでは deploy が 5-10 秒かかるため、タイムアウトを大きめに取る
      testTimeout: isRealKintoneMode ? 30_000 : 5_000,
      hookTimeout: isRealKintoneMode ? 60_000 : 10_000,
      alias: {
        "tests/": new URL("./tests/", import.meta.url).pathname,
      },
    },
  };
});
