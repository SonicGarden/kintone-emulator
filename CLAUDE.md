# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

kintone の REST API をローカルでエミュレートするサーバー。`@kintone/rest-api-client` をそのまま使ってリクエスト可能。インメモリ SQLite を使用するため起動が速く、テスト後にデータが残らない。

## コマンド

```sh
pnpm install          # 依存関係のインストール
pnpm dev              # 開発サーバー起動（ポート 12345）
pnpm build            # プロダクションビルド
pnpm start            # 本番サーバー起動（要ビルド）
pnpm lint             # ESLint 実行
pnpm typecheck        # 型チェック
pnpm test             # テスト一度実行（インプロセスサーバーを自動起動）
pnpm test:e2e         # E2Eテスト実行（事前に pnpm build が必要）
pnpm test:watch       # テストウォッチモード（インプロセスサーバーを自動起動）
```

単一テストファイルの実行:

```sh
pnpm test tests/api/record/record.test.ts
```

## アーキテクチャ

### 技術スタック

- **Remix 2.x** — ファイルベースルーティング、サーバー/クライアント統合
- **Vite** — ビルドツール（開発ポート: 12345）
- **SQLite3（インメモリ）** — セッション別独立データストア
- **Vitest** — テストフレームワーク（forkプール、singleFork設定）

### ルーティング構造（`app/routes/`）

Remix のファイルベースルーティングで kintone API をエミュレート。`($session)` が URL プレフィックスでセッションを分離する。

| ファイル名パターン | エンドポイント |
|---|---|
| `($session).initialize.tsx` | POST `/{session}/initialize` |
| `($session).finalize.tsx` | POST `/{session}/finalize` |
| `($session).k.v1.app[.]json.tsx` | GET `/{session}/k/v1/app.json` |
| `($session).k.v1.apps[.]json.tsx` | GET `/{session}/k/v1/apps.json` |
| `($session).k.v1.record[.]json.tsx` | GET/POST/PUT `/{session}/k/v1/record.json` |
| `($session).k.v1.records[.]json.tsx` | GET `/{session}/k/v1/records.json` |
| `($session).k.v1.app.form.fields[.]json.tsx` | GET `/{session}/k/v1/app/form/fields.json` |
| `($session).k.v1.app.form.layout[.]json.tsx` | GET `/{session}/k/v1/app/form/layout.json` |
| `($session).k.v1.preview.app.form.fields[.]json.tsx` | POST/DELETE `/{session}/k/v1/preview/app/form/fields.json` |
| `($session).k.v1.file[.]json.tsx` | GET/POST `/{session}/k/v1/file.json` |
| `($session).setup.app[.]json.tsx` | POST `/{session}/setup/app.json` |

### データ層（`app/core/db/`）

- **`client.ts`** — SQLite 接続管理。`dbSession(session?)` でセッション別インメモリDBを返す。`serialize()`, `run()`, `all()` でSQL操作を抽象化。singleton 管理も統合
- **`tables.ts`** — DDL。`createTables()` / `dropTables()` でスキーマを管理
- **`records.ts`** — レコードの CRUD 操作（findRecord, findRecords, findRecordsByClause, insertRecord, updateRecord）
- **`apps.ts`** — アプリの CRUD 操作（findApp, findApps, insertApp）
- **`fields.ts`** — フィールドの CRUD 操作（findFields, findFieldTypes, insertFields, deleteFields）
- **`files.ts`** — ファイルの CRUD 操作（findFile, insertFile）

### ハンドラー層（`app/core/handlers/`）

- Remix 非依存なリクエストハンドラー。`HandlerArgs = { request: Request; params }` を受け取り `Promise<Response>` を返す
- SQL を直接実行せず、`db/` の関数を呼ぶだけ
- HTTP verb ごとに関数をエクスポート（`get`, `post`, `put`, `del`）

### サーバー（`app/core/server.ts`）

- インプロセス HTTP サーバー。テストや外部利用時に `startServer(port?)` で起動可能。ポート省略時は OS が未使用ポートを自動割り当て

### セッション分離の仕組み

URLプレフィックス（`/{session}/`）でセッションを識別し、セッション毎に独立したインメモリSQLiteを保持。テスト前に `initialize`、テスト後に `finalize` を呼ぶことでテストの並列実行が可能。

### SQLite テーブル構造

`initialize` で以下のテーブルを作成:
- `fields` — フォームフィールド定義（`app_id`, `code`, `body` JSON）
- `records` — レコードデータ（`app_id`, `body` JSON, `revision`）
- `files` — アップロードファイル（`filename`, `content_type`, `data` BLOB）
- `apps` — アプリ定義（`name`, `revision`, `layout`）

## テスト

テストは `tests/api/` 以下にあり、実際に HTTP リクエストを送るインテグレーションテスト。`tests/config.ts` の `getHost()` でホストを動的に取得（`setup.ts` の `beforeAll` でサーバー起動後に `TEST_PORT` 環境変数へ設定される）。

各テストは `beforeEach` で `initialize`、`afterEach` で `finalize` を実行してセッションを管理。`BASE_URL` はモジュールレベルではなく `beforeAll` で代入する。

```ts
const SESSION = "unique-test-session-name";
let BASE_URL: string;
beforeAll(() => {
  BASE_URL = createBaseUrl(SESSION);
});
```

## タスク完了のワークフロー

実装タスクを完了するには、コードを実装した後に `/finish-task` コマンドを実行する。

## claude code のツールの使用
- cat や head は使わず Read ツール使うこと

