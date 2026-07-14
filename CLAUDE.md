# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

kintone の REST API をローカルでエミュレートするサーバー。`@kintone/rest-api-client` をそのまま使ってリクエスト可能。インメモリ SQLite を使用するため起動が速く、テスト後にデータが残らない。

pnpm workspace モノレポ構成：

```
packages/
├── cli/    (@sonicgarden/kintone-emulator-cli)    CLI ツール（export-app など）
├── core/   (@sonicgarden/kintone-emulator)        DB・ハンドラー・インプロセスサーバー・テスト・JSカスタマイズテスト用スタブ
└── server/ (@sonicgarden/kintone-emulator-server) Remix サーバー・ルート・E2Eテスト
```

`@sonicgarden/kintone-emulator` のエントリポイント:
- `.` (`src/index.ts`) — インプロセスサーバー起動（`startServer`）
- `./test-support` (`src/test-support/index.ts`) — テストヘルパー（`createBaseUrl`, `createApp`, `initializeSession` など）
- `./test-support/vitest` (`src/test-support/vitest.ts`) — vitest 用ラッパー（`describeDualMode`, `describeEmulatorOnly`）
- `./hook-test` (`src/hook-test/index.ts`) — JS カスタマイズテスト用スタブ（`createKintoneStub`）

## コマンド

```sh
pnpm install          # 依存関係のインストール
pnpm dev              # 開発サーバー起動（ポート 12345）
pnpm build            # プロダクションビルド（core → server → cli の順）
pnpm start            # 本番サーバー起動（要ビルド）
pnpm lint             # ESLint 実行
pnpm typecheck        # 型チェック
pnpm test             # テスト一度実行（インプロセスサーバーを自動起動）
pnpm test:e2e         # E2Eテスト実行（事前に pnpm build が必要）
pnpm test:watch       # テストウォッチモード（インプロセスサーバーを自動起動）
pnpm --filter @sonicgarden/kintone-emulator-server test:ui  # 画面テスト実行（Playwright、事前に pnpm build が必要）
```

単一テストファイルの実行:

```sh
pnpm test packages/core/tests/api/record/record.test.ts
```

core パッケージの tarball 生成（prepack で自動ビルド）:

```sh
pnpm --filter @sonicgarden/kintone-emulator pack
```

## アーキテクチャ

### 技術スタック

- **Remix 2.x** — ファイルベースルーティング、サーバー/クライアント統合（`packages/server`）
- **Vite** — ビルドツール（開発ポート: 12345）
- **SQLite3（インメモリ）** — セッション別独立データストア（`packages/core`）
- **Vitest** — テストフレームワーク（forkプール、singleFork設定）

### パッケージ依存関係

`packages/server` → `packages/core`（workspace:*）

開発時は `packages/server/tsconfig.json` の paths で `@sonicgarden/kintone-emulator/*` を `../core/src/*` に解決（ホットリロード対応）。本番ビルド時は `packages/core/dist/` を参照。

### ルーティング構造（`packages/server/app/routes/`）

Remix のファイルベースルーティングで kintone API をエミュレート。`($session)` が URL プレフィックスでセッションを分離する。

| ファイル名パターン | エンドポイント |
|---|---|
| `($session).initialize.tsx` | POST `/{session}/initialize` |
| `($session).finalize.tsx` | POST `/{session}/finalize` |
| `($session).k.v1.app[.]json.tsx` | GET `/{session}/k/v1/app.json` |
| `($session).k.v1.apps[.]json.tsx` | GET `/{session}/k/v1/apps.json` |
| `($session).k.v1.record[.]json.tsx` | GET/POST/PUT `/{session}/k/v1/record.json` |
| `($session).k.v1.records[.]json.tsx` | GET/DELETE `/{session}/k/v1/records.json` |
| `($session).k.v1.app.status[.]json.tsx` | GET `/{session}/k/v1/app/status.json` |
| `($session).k.v1.app.form.fields[.]json.tsx` | GET `/{session}/k/v1/app/form/fields.json` |
| `($session).k.v1.app.form.layout[.]json.tsx` | GET `/{session}/k/v1/app/form/layout.json` |
| `($session).k.v1.preview.app.form.fields[.]json.tsx` | POST/DELETE `/{session}/k/v1/preview/app/form/fields.json` |
| `($session).k.v1.file[.]json.tsx` | GET/POST `/{session}/k/v1/file.json` |
| `($session).k.v1.record.comment[.]json.tsx` | POST/DELETE `/{session}/k/v1/record/comment.json` |
| `($session).k.v1.record.comments[.]json.tsx` | GET `/{session}/k/v1/record/comments.json` |
| `($session).setup.app[.]json.tsx` | POST `/{session}/setup/app.json`（`records` でレコード一括作成も可能） |
| `($session).k._index.tsx` | GET `/{session}/k/` （アプリ一覧UI画面） |

### データ層（`packages/core/src/db/`）

- **`client.ts`** — SQLite 接続管理。`dbSession(session?)` でセッション別インメモリDBを返す。`run()`, `all()` でSQL操作を抽象化。singleton 管理も統合
- **`tables.ts`** — DDL。`createTables()` / `dropTables()` でスキーマを管理
- **`records.ts`** — レコードの CRUD 操作（findRecord, findRecords, findRecordsByClause, findRecordByKey, insertRecord, updateRecord）
- **`apps.ts`** — アプリの CRUD 操作（findApp, findApps, insertApp）
- **`fields.ts`** — フィールドの CRUD 操作（findFields, findFieldTypes, insertFields, deleteFields）
- **`files.ts`** — ファイルの CRUD 操作（findFile, insertFile）
- **`comments.ts`** — コメントの CRUD 操作（findRecordExists, findComments, countComments, insertComment, deleteComment）

### ハンドラー層（`packages/core/src/handlers/`）

- Remix 非依存なリクエストハンドラー。`HandlerArgs = { request: Request; params }` を受け取り `Promise<Response>` を返す
- SQL を直接実行せず、`db/` の関数を呼ぶだけ
- HTTP verb ごとに関数をエクスポート（`get`, `post`, `put`, `del`）

### サーバー（`packages/core/src/server.ts`）

- インプロセス HTTP サーバー。テストや外部利用時に `startServer(port?)` で起動可能。ポート省略時は OS が未使用ポートを自動割り当て

### hook-test（`packages/core/src/hook-test/`）

kintone の JS カスタマイズコード（`kintone.events.on(...)` など）を Node.js / vitest でテストするためのスタブ。`@sonicgarden/kintone-emulator/hook-test` としてエクスポートされる。

- **`index.ts`** — エントリポイント
- **`types.ts`** — `KintoneStub` / `KintoneEventObject` / `KintoneApiFunction` / `KintoneElementStub` などの型定義
- **`kintone-stub.ts`** — `createKintoneStub(options?)` の実装
  - `events.on/off/fire/clear` — イベント登録・発火
  - `app.record.get/set` / `app.getId()` / `app.getRecordId()` — フォームデータ操作
  - `app.getQuery()` / `app.getQueryCondition()` — クエリ文字列
  - `app.getHeaderMenuSpaceElement()` / `app.getHeaderSpaceElement()` — DOM 要素スタブ（`children` で追加要素を検証可能）
  - `api(url, method, params)` — `baseUrl` を渡した場合はエミュレーターにプロキシ
  - `api.url(path)` — `/k/v1/records` → `/k/v1/records.json`（`kintone.api.url()` 互換）
  - `_setAppId` / `_setRecordId` / `_setRecord` / `_setQuery` — テスト補助メソッド

### core パッケージのビルド

`packages/core/tsup.config.ts` で `src/` 以下の複数エントリポイントをビルドして `dist/` に出力（ESM 形式、`dts: true` で型定義も生成）。消費者が Vite 等のバンドラーを使うことを前提としているため、拡張子なし import のままビルドする。エントリポイントは `src/index.ts` / `src/server.ts` / `src/handlers/*.ts` / `src/db/*.ts` / `src/test-support/*.ts` / `src/hook-test/index.ts`。

### CLI パッケージ（`packages/cli/`）

- `commander` ベースの CLI ツール。`export-app` サブコマンドで実際の kintone 環境からアプリ定義を取得し、`setup/app.json` 形式の JSON を stdout に出力する
- `tsup` でビルド（shebang 付与）。`@kintone/rest-api-client` を dependencies に持つ（npx 単独実行対応）

### セッション分離の仕組み

URLプレフィックス（`/{session}/`）でセッションを識別し、セッション毎に独立したインメモリSQLiteを保持。テスト前に `initialize`、テスト後に `finalize` を呼ぶことでテストの並列実行が可能。

### SQLite テーブル構造

`initialize` で以下のテーブルを作成:
- `fields` — フォームフィールド定義（`app_id`, `code`, `body` JSON）
- `records` — レコードデータ（`app_id`, `body` JSON, `revision`）
- `files` — アップロードファイル（`filename`, `content_type`, `data` BLOB）
- `apps` — アプリ定義（`name`, `revision`, `layout`, `status` JSON）
- `comments` — レコードコメント（`app_id`, `record_id`, `message`, `mentions` JSON）

## テスト

テストは `packages/core/tests/api/` 以下にあり、実際に HTTP リクエストを送るインテグレーションテスト。`packages/core/tests/config.ts` の `getHost()` でホストを動的に取得（`setup.ts` の `beforeAll` でサーバー起動後に `TEST_PORT` 環境変数へ設定される）。

各テストは `beforeEach` で `initialize`、`afterEach` で `finalize` を実行してセッションを管理。`BASE_URL` はモジュールレベルではなく `beforeAll` で代入する。

```ts
const SESSION = "unique-test-session-name";
let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl(SESSION);
});
```

### hook-test を使ったテスト

kintone JS カスタマイズのテストは `createKintoneStub()` を使って書く。テストは `packages/core/tests/api/hook/` 以下に置く。

```ts
import { createKintoneStub } from "../../../src/hook-test";

test("...", async () => {
  const stub = createKintoneStub({ baseUrl: BASE_URL }); // REST API が必要な場合のみ baseUrl を渡す
  // カスタマイズコードの setup 関数にスタブを渡す
  setup(stub);
  const result = await stub.events.fire("app.record.create.submit", { record: { ... } });
  expect(result).not.toBe(false);
});
```

`kintone.api.url()` を使うカスタマイズでは `stub.api.url(path)` が `/k/v1/records.json` 形式のパスを返す。`_setQuery()` / `_setAppId()` でテスト用の状態を注入できる。

## タスク完了のワークフロー

実装タスクを完了するには、コードを実装した後に `/finish-task` コマンドを実行する。

## claude code のツールの使用
- cat や head は使わず Read ツール使うこと
