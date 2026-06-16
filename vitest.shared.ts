// 各サブパッケージの vitest.config.ts から mergeConfig で取り込む共通設定。
// reporters / outputFile は vitest 4 では root 専用設定なので、サブパッケージ
// 単独実行 (例: `cd packages/core && pnpm test`) でも reporter を効かせるために、
// 各サブパッケージの config がそれぞれこの共通設定をマージする。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // verbose: stdout 向け
    // github-actions: GitHub Actions 上で失敗テストを PR の inline annotation 表示。
    //   https://vitest.dev/guide/reporters.html#github-actions-reporter
    //   常時有効だとローカルでも ::error:: 等が verbose 出力に混ざるので
    //   GITHUB_ACTIONS=true (= GitHub Actions runner 上) のとき限定で有効化する。
    // html: ローカル / artifacts でブラウザ閲覧用 (@vitest/ui パッケージ依存)
    // minimal + json: Claude Code 実行時 (CLAUDECODE=1) は stdout を最小化し、
    //   結果は json ファイルから参照させる。
    reporters:
      process.env.CLAUDECODE === "1"
        ? (["minimal", "json"] as const)
        : [
            "verbose",
            ...(process.env.GITHUB_ACTIONS === "true"
              ? (["github-actions"] as const)
              : []),
            "html",
          ],
    outputFile: {
      // 各サブパッケージの coverage/ 配下に出力 (相対パスはサブパッケージ root から解決される)
      html: "./coverage/test-results/index.html",
      json: "./coverage/test-results/results.json",
    },
    // カバレッジ計測設定 (https://vitest.dev/guide/coverage.html)
    // `--coverage` フラグ指定時のみ有効化される。provider に v8 を使う場合は
    // 別途 `@vitest/coverage-v8` のインストールが必要。
    coverage: {
      provider: "v8",
      reporter: ["html"],
      // coverage HTML は ./coverage/coverage/ 配下に出力する。
      // ./coverage/ 直下は test-results との混在を避けるため使わない
      // (coverage は実行のたびに reportsDirectory を clean するため)。
      reportsDirectory: "./coverage/coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.d.ts", "**/*.test.{ts,tsx}", "**/__mocks__/**"],
    },
  },
});
