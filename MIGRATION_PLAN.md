# Remix → React Router v7 移行計画

## 目的

- Remix 2.15 → React Router v7 (framework mode)
- Vite 5 → 7（最終的に 8 を目指すが RR v7 dev の Vite 8 対応待ち）
- Vitest 2 → 4
- React は 18 維持（必要になったら別タスクで 19 へ）

## 制約（調査済み）

| パッケージ | 対応 Vite |
|---|---|
| `@remix-run/dev@2.15.2` | `^5.1.0` のみ |
| `@remix-run/dev@2.17.4`（Remix 最新） | `^5.1.0 \|\| ^6.0.0` |
| `@react-router/dev`（v7） | Vite 5/6/7（Vite 8 は未対応・[discussion #14869](https://github.com/remix-run/react-router/discussions/14869)） |
| `vitest@4.1.5` | `vite: ^6 \|\| ^7 \|\| ^8` |

→ Vitest 4 を使うには Vite 6 以上が必要。Remix のままでも 2.17 + Vite 6 + Vitest 4 までは到達可能。

## 進め方（案 A: 段階移行）

### Phase 1: Remix を維持したまま Vite 6 / Vitest 4 へ ✅

- [x] `@remix-run/*` を 2.15.2 → 2.17.4 に更新
- [x] `vite` を ^5 → ^6.4.2 に更新（root + core + server）
- [x] `vitest` を ^2.1.9 → ^4.1.5 に更新
- [x] `vite-tsconfig-paths` を ^4.3.2 → ^6.1.1 に更新
- [x] Vitest 4 の breaking change 対応: `poolOptions.forks.singleFork` → `maxWorkers: 1, isolate: false`（core/server の 2 ファイル）
- [x] 未使用依存 `remix-utils` を削除
- [x] `pnpm typecheck` / `pnpm lint` 通過
- [x] `pnpm test` 通過（474 passed, 5 skipped）
- [x] `pnpm build` 成功
- [x] `pnpm test:e2e` 通過（296 passed）
- [ ] `engines.node` の見直しは Phase 2 の Vite 7 化と一緒に

### Phase 2: Remix → React Router v7 framework mode

- [ ] 依存差し替え
  - 削除: `@remix-run/node` `@remix-run/react` `@remix-run/serve` `@remix-run/dev`
  - 追加: `react-router` `@react-router/node` `@react-router/serve` `@react-router/dev` `@react-router/fs-routes`
- [ ] `vite.config.ts` の `vitePlugin as remix` → `reactRouter` from `@react-router/dev/vite`
- [ ] `react-router.config.ts` を新規作成
- [ ] `app/routes.ts` を作り `flatRoutes()` で現行の flat 規約を維持
- [ ] `app/entry.server.tsx` を `ServerRouter` ベースに書き換え
- [ ] `app/entry.client.tsx` を `HydratedRouter` ベースに書き換え
- [ ] `app/root.tsx` の import を `react-router` へ
- [ ] 全ルート（30+ファイル）の `@remix-run/node` import を `react-router` へ一括置換
- [ ] `json()` ヘルパの非推奨対応（必要なら `data()` または `Response.json()` へ）
- [ ] `package.json` の scripts を `react-router dev / build / serve` に変更
- [ ] `tsconfig.json` の types 更新、`.react-router/types` 取り込み
- [ ] vite を ^6 → ^7 に更新
- [ ] 全テスト通過確認

### Phase 3（保留）

- Vite 7 → 8: `@react-router/dev` の Vite 8 対応待ち
- React 18 → 19: 必要性が出たら別タスク

## 進捗ログ

### 2026-04-30 Phase 1 完了

- 依存更新: `@remix-run/*@2.17.4`, `vite@6.4.2`, `vitest@4.1.5`, `vite-tsconfig-paths@6.1.1`
- Vitest 4 で `test.poolOptions` が削除された。`poolOptions.forks.singleFork: true` は `maxWorkers: 1, isolate: false` に変更（migration guide 通り）
  - 影響範囲: `packages/core/vitest.config.ts`, `packages/server/vitest.config.e2e.ts`
- `remix-utils` は実コードで未使用だったため削除
- 全テスト・ビルド・E2E 通過

