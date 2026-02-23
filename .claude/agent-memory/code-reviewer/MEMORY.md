# Code Reviewer Memory

## プロジェクト概要
kintone REST APIエミュレーター。Remix 2.x + SQLite (インメモリ) + Vitest。

## 重要ファイルパス
- `app/routes/` — Remixルート（`($session)` プレフィックスでセッション分離）。薄いラッパーのみ
- `app/core/db.ts` — DB操作: `dbSession()`, `run()`, `all()`, `serialize()`（旧 `app/utils/db.server.ts`）
- `app/core/singleton.ts` — グローバルシングルトン管理（旧 `app/utils/singleton.server.ts`）
- `app/core/fields.ts` — フィールド挿入ヘルパー `insertFields()`（旧 `app/utils/fields.server.ts`）
- `app/core/query.ts` — `getFieldTypes()` のみ。クエリ変換ロジックは `app/core/handlers/records.ts` に移動済み
- `app/core/handlers/` — 各APIハンドラー（Remix非依存の純粋な関数）
- `app/core/server.ts` — インプロセスHTTPサーバー本体。ルートテーブルを管理
- `app/server.ts` — `startServer` の re-export のみ
- `tests/api/` — インテグレーションテスト（実際にHTTPリクエストを送る）
- `tests/config.ts` — テストホスト設定（localhost:12345）
- `tests/helpers.ts` — `createBaseUrl()`, `initializeSession()`, `finalizeSession()`, `createApp()` ヘルパー

## コードパターン・規約
- ルートファイル名: `($session).k.v1.xxx[.]json.tsx` (`[.]` でドットエスケープ)
- DBアクセス: `dbSession(params.session)` でセッション別DB取得
- SQLクエリ: `run()` (戻り値不要のINSERT/UPDATE/DELETE), `all<T>()` (SELECT、およびRETURNING句付きINSERT/UPDATE)
- テーブル初期化: `serialize()` + `db.run()` を `($session).initialize.tsx` で行う
- JSON カラム: SQLiteに文字列で保存し、読み出し時に `JSON.parse()` する
- revision: 数値で保存し、レスポンス時に `.toString()` で文字列化

## テストパターン
- 各テストは `beforeEach` で `initialize`、`afterEach` で `finalize`
- `SESSION` 定数でテストファイルごとに一意のセッション名を使用
- `@kintone/rest-api-client` の `KintoneRestAPIClient` を使って実際のAPIをテスト

## よく見られる課題
- `CLAUDE.md` / `README.md` のルーティングテーブルへの新規エンドポイント追記忘れ（追記済みの例: `app[.]json.tsx`, `apps[.]json.tsx`）
- クエリパラメーターの配列形式（`ids[0]=1&ids[1]=2`）は `key.includes('ids')` ではなく `key.startsWith('ids')` で解析する（`apps[.]json.tsx` で修正済み）
- 必須クエリパラメーター（`id` など）が欠落した場合は 400 を返す明示的バリデーションを追加する（`app[.]json.tsx` で実装済み）
- テストのセッション管理で `createBaseUrl()` を正しく使うパターンに移行済み（`record-test-session`, `records`, `file-test-session` など）。ただし `records.test.ts` で `createApp` を呼ばず `app: 1` をハードコードしている既存問題あり（変更差分外）
- `apps` テーブルのカラム定義がCLAUDE.mdに `name`, `revision` のみ記載（実際は `layout` も追加済み）
- アプリが存在しない場合の404エラーハンドリング未実装パターン → `fields[.]json.tsx` および `layout[.]json.tsx` で修正済み
- `setup/app.json` でlayout保存時にINSERTとUPDATEを別クエリで実行（1クエリにできる）→ 修正済み
- `app/form/fields`では `revision` が常に `'1'` の固定値を返す（実際のappsテーブルと連動していない）
- `loader` 関数に `ActionFunctionArgs` を誤って使うパターンに注意。`loader` には `LoaderFunctionArgs`、`action` には `ActionFunctionArgs` が正しい（実行時差異はないが型として不正確）→ `fields[.]json.tsx` で修正済み
- PUT後に `last_insert_rowid()` でレコード取得していたバグは `RETURNING` 句への変更で修正済み（record[.]json.tsx）
- `RETURNING` 句を使う場合は `run()` ではなく `all<T>()` を使う（規約変更）
- UPDATE/INSERT後に `RETURNING` が0件の場合の404ガードが抜けやすい → `recordResult.length === 0` チェックを忘れずに
- `file.ts` の `post` 関数: INSERT RETURNING後の 0 件ガード追加済み。`recordResult.length === 0` → 500 + `'Failed to upload file.'`
- `record.ts` の `post` 関数: INSERT失敗時を 500 + `'Failed to create record.'` に修正済み
- `setup-app.ts` の `post` 関数: `result[0].id` への 0 件ガードが未追加（既知の未修正問題）

## コードスタイル規約
- `app/core/handlers/` 内は全て `export const fn = async () => {}` スタイルに統一済み
- 0件ガードのスタイルは `result.length === 0` が標準パターン。`!result[0]` は避ける（`layout.ts` のみ旧スタイル残存）

## 既知のアーキテクチャ決定
- インメモリSQLiteのため `finalize` でテーブルをDROP（セッションIDごとに独立）
- `singleton.server.ts` でホットリロード時もDBインスタンスを維持
- JSON型カラムはSQLiteに文字列として格納（`body JSON`, `layout JSON`）
- `fields` テーブル: 旧 `type`, `label` カラムは廃止され `body JSON` に全属性を格納。`code` カラムは検索用に残しつつ `body` にも重複して保存
- JSON path: SQLiteのJSON演算子 `body->>'$.type'` でJSONフィールドを直接クエリ可能（`query.ts`, `record[.]json.tsx` で使用）
- `app/server.ts` + `tests/setup.ts`: Vitestインプロセス起動用サーバー。`vitest.config.ts` の `setupFiles` で `beforeAll`/`afterAll` 管理
- `tests/helpers.ts`: セッション名を `${name}-${process.pid}` 形式で生成する `createBaseUrl()` ヘルパー。テスト並列実行時の衝突回避に使用
- インプロセスサーバー実装時の注意: ルートテーブル（`app/core/server.ts`）で全メソッドを漏れなく登録する。CLAUDE.md に GET/POST と記載されているエンドポイントは両方登録が必要
- `app/routes/($session).k.v1.app.form.fields[.]json.tsx` は GET のみ実装（server.ts も GET のみ登録）。POST は `/k/v1/preview/app/form/fields.json` が担う設計
- Node.js IncomingMessage → Web API Request 変換: `Readable.toWeb(req)` + `duplex: "half"` パターンを使用
- ファイルアップロード: `unstable_parseMultipartFormData` から `request.formData()` に変更済み（Web標準API）
- `app/core/query.ts` にはクエリ変換ロジックが存在せず `getFieldTypes()` のみ。クエリ変換ロジック（`replaceField`, `hasWhereClause`）は `app/core/handlers/records.ts` に移動済み。ファイル名と責務が乖離しているため要注意
- Issue 01 リファクタリング: handlers/ の `loader`/`action` を `get`/`post`/`put`/`del` に変更。routes/ は薄いラッパーとして verb ディスパッチ。HandlerArgs 型 (`{ request: Request; params }`) で Remix 非依存化
- `RouteEntry` 型（server.ts）: `GET?`/`POST?`/`PUT?`/`DELETE?` を Optional にして 405 ハンドリングを型安全に実装
