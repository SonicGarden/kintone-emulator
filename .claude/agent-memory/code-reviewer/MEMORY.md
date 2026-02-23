# Code Reviewer Memory

## プロジェクト概要
kintone REST APIエミュレーター。Remix 2.x + SQLite (インメモリ) + Vitest。

## 重要ファイルパス
- `app/routes/` — Remixルート（`($session)` プレフィックスでセッション分離）。薄いラッパーのみ
- `app/core/db/client.ts` — DB操作: `dbSession()`, `run()`, `all()`, `serialize()`、singleton 統合済み
- `app/core/db/tables.ts` — DDL: `createTables()` / `dropTables()`
- `app/core/db/records.ts` — `findRecord` / `findRecords` / `findRecordsByClause` / `insertRecord` / `updateRecord`
- `app/core/db/apps.ts` — `findApp` / `findApps` / `insertApp`
- `app/core/db/fields.ts` — `findFields` / `findFieldTypes` / `insertFields` / `deleteFields`、`FieldProperties` 型
- `app/core/db/files.ts` — `findFile` / `insertFile`
- `app/core/handlers/` — 各APIハンドラー（Remix非依存。db/ を呼ぶだけ）
- `app/core/server.ts` — インプロセスHTTPサーバー本体。ルートテーブルを管理
- `app/server.ts` — `startServer` の re-export のみ
- `tests/api/` — インテグレーションテスト（実際にHTTPリクエストを送る）
- `tests/config.ts` — テストホスト設定（localhost:12345）
- `tests/helpers.ts` — `createBaseUrl()`, `initializeSession()`, `finalizeSession()`, `createApp()` ヘルパー

## コードパターン・規約
- ルートファイル名: `($session).k.v1.xxx[.]json.tsx` (`[.]` でドットエスケープ)
- DBアクセス: `dbSession(params.session)` でセッション別DB取得（`app/core/db/client.ts` から import）
- SQLクエリ: `run()` (戻り値不要のINSERT/UPDATE/DELETE), `all<T>()` (SELECT、およびRETURNING句付きINSERT/UPDATE)
- handlers/ は SQL を直接実行しない。db/ の関数を呼ぶだけ
- JSON カラム: SQLiteに文字列で保存し、読み出し時に `JSON.parse()` する
- revision: 数値で保存し、レスポンス時に `.toString()` で文字列化

## テストパターン
- 各テストは `beforeEach` で `initialize`、`afterEach` で `finalize`
- `SESSION` 定数でテストファイルごとに一意のセッション名を使用
- `@kintone/rest-api-client` の `KintoneRestAPIClient` を使って実際のAPIをテスト

## よく見られる課題（セットアップ・テスト関連）
- 外部プロセス起動セットアップでは `serverProcess.once("exit", ...)` でクラッシュ早期検知が必要（`Promise.race` パターン）
- `spawn` 後の `afterAll` は `serverProcess.kill()` だけでなく `once("exit", resolve)` で完了を待つ
- `stdio: "pipe"` にするとサーバーログが全破棄される。`stderr` は `process.stderr` に pipe 推奨
- 外部プロセス起動テスト（e2e）は `pnpm build` が前提。スクリプト定義か CLAUDE.md に明記が必要

## よく見られる課題
- `CLAUDE.md` のデータ層の記述（`app/core/` セクション）が古いまま残りやすい（Issue 02 後は `db/` ディレクトリ構造を記述する必要あり）
- クエリパラメーターの配列形式（`ids[0]=1&ids[1]=2`）は `key.startsWith('ids')` で解析（修正済み）
- 必須クエリパラメーター（`id` など）が欠落した場合は 400 を返す明示的バリデーションを追加する
- `app/form/fields`では `revision` が常に `'1'` の固定値を返す（実際のappsテーブルと連動していない）
- PUT後に `last_insert_rowid()` でレコード取得していたバグは `RETURNING` 句への変更で修正済み（record[.]json.tsx）
- `RETURNING` 句を使う場合は `run()` ではなく `all<T>()` を使う
- UPDATE/INSERT後に `RETURNING` が0件の場合の404/500ガードが抜けやすい
- `app.ts` / `apps.ts` の `toAppResponse` 関数が重複している（既知の DRY 違反）
- `record.ts` で `findRecords` を import しているが使っていない（未使用 import）
- `findRecordsByClause` の第4引数 `hasWhere: boolean` は caller（handlers/records.ts）とのインターフェース設計として責務の分散あり（既知）

## コードスタイル規約
- `app/core/handlers/` 内は全て `export const fn = async () => {}` スタイルに統一済み
- 0件ガードのスタイルは `result.length === 0` が標準パターン。`!result[0]` は避ける

## 既知のアーキテクチャ決定
- インメモリSQLiteのため `finalize` でテーブルをDROP（セッションIDごとに独立）
- singleton（`app/core/db/client.ts` 内の `singleton` 関数）でホットリロード時もDBインスタンスを維持
- JSON型カラムはSQLiteに文字列として格納（`body JSON`, `layout JSON`）
- `fields` テーブル: 旧 `type`, `label` カラムは廃止され `body JSON` に全属性を格納。`code` カラムは検索用に残しつつ `body` にも重複して保存
- JSON path: SQLiteのJSON演算子 `body->>'$.type'` でJSONフィールドを直接クエリ可能
- `app/server.ts` + `tests/setup.ts`: Vitestインプロセス起動用サーバー。`vitest.config.ts` の `setupFiles` で `beforeAll`/`afterAll` 管理
- `tests/setup.e2e.ts` + `vitest.config.e2e.ts`: 外部プロセス（remix-serve）起動用E2Eセットアップ。`pnpm test:e2e` で実行（要 `pnpm build`）。ポート 12346 を使用
- `tests/helpers.ts`: セッション名を `${name}-${process.pid}` 形式で生成する `createBaseUrl()` ヘルパー。テスト並列実行時の衝突回避に使用
- `app/routes/($session).k.v1.app.form.fields[.]json.tsx` は GET のみ実装。POST は `/k/v1/preview/app/form/fields.json` が担う設計
- Node.js IncomingMessage → Web API Request 変換: `Readable.toWeb(req)` + `duplex: "half"` パターン
- ファイルアップロード: `request.formData()` を使用（Web標準API）
- kintone クエリ→SQL 変換ロジック（`replaceField`, `hasWhereClause`）は `app/core/handlers/records.ts` に残存。`db/records.ts` の `findRecordsByClause` に WHERE 句を文字列として渡す設計
- `RouteEntry` 型（server.ts）: `GET?`/`POST?`/`PUT?`/`DELETE?` を Optional にして 405 ハンドリングを型安全に実装
- Issue 01 リファクタリング: handlers/ の `loader`/`action` を `get`/`post`/`put`/`del` に変更
- Issue 02 リファクタリング: SQL 実行コードを `app/core/db/` に集約。handlers/ は db/ を呼ぶだけ
