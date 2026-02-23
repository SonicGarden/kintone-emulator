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

### データ層（`app/core/`）

- **`db.ts`** — SQLite 接続管理。`dbSession(session?)` でセッション別インメモリDBを返す。`serialize()`, `run()`, `all()` でSQL操作を抽象化
- **`singleton.ts`** — グローバルシングルトン管理。Remix の開発時ホットリロードでも DB インスタンスを保持するために使用
- **`fields.ts`** — フィールド挿入ヘルパー。`insertFields()` でアプリのフィールド定義を一括登録
- **`query.ts`** — フィールド型取得ヘルパー。`getFieldTypes()` でアプリのフィールド型マップを返す
- **`handlers/`** — Remix 非依存なリクエストハンドラー。`HandlerArgs = { request: Request; params }` を受け取り `Promise<Response>` を返す
- **`server.ts`** — インプロセス HTTP サーバー。テストや外部利用時に `startServer(port)` で起動可能

### セッション分離の仕組み

URLプレフィックス（`/{session}/`）でセッションを識別し、セッション毎に独立したインメモリSQLiteを保持。テスト前に `initialize`、テスト後に `finalize` を呼ぶことでテストの並列実行が可能。

### SQLite テーブル構造

`initialize` で以下のテーブルを作成:
- `fields` — フォームフィールド定義（`app_id`, `code`, `body` JSON）
- `records` — レコードデータ（`app_id`, `body` JSON, `revision`）
- `files` — アップロードファイル（`filename`, `content_type`, `data` BLOB）
- `apps` — アプリ定義（`name`, `revision`, `layout`）

## テスト

テストは `tests/api/` 以下にあり、実際に HTTP リクエストを送るインテグレーションテスト。`tests/api/config.ts` でホスト（`localhost:12345`）を設定。

各テストは `beforeEach` で `initialize`、`afterEach` で `finalize` を実行してセッションを管理。

```ts
const SESSION = "unique-test-session-name";
const BASE_URL = `http://${host}/${SESSION}`;
```

## タスク完了のワークフロー

実装タスクを完了するには、以下のサイクルをエージェント自身が繰り返す。(ユーザーに操作を依頼しない)

1. コードを実装する
2. `pnpm build && pnpm test` でテストをすべてパスさせる
3. カスタムサブエージェント `code-reviewer` にレビューさせる（`.claude/agents/code-reviewer.md` に定義)
4. レビュー内容が妥当なら修正し、2に戻る
5. レビューで問題なしならタスク完了
6. レビューは最大5回まで

## claude code のツールの使用
- cat や head は使わず Read ツール使うこと

