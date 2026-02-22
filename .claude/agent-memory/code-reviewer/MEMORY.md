# Code Reviewer Memory

## プロジェクト概要
kintone REST APIエミュレーター。Remix 2.x + SQLite (インメモリ) + Vitest。

## 重要ファイルパス
- `app/routes/` — Remixルート（`($session)` プレフィックスでセッション分離）
- `app/utils/db.server.ts` — DB操作: `dbSession()`, `run()`, `all()`, `serialize()`
- `app/utils/singleton.server.ts` — グローバルシングルトン管理
- `tests/api/` — インテグレーションテスト（実際にHTTPリクエストを送る）
- `tests/api/config.ts` — テストホスト設定（localhost:12345）

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
- テストのセッション管理で `SESSION` 定数を使わずURLをハードコードするパターン（`record.test.ts`: `record`セッション, `records.test.ts`: `records`セッション, `file.test.ts`: `form`セッションをハードコード）→ 他テストとのセッション衝突リスク。`SESSION` 定数 + `BASE_URL` を使う正しいパターンは `app.test.ts`, `form.test.ts`, `layout.test.ts` で確認済み
- `apps` テーブルのカラム定義がCLAUDE.mdに `name`, `revision` のみ記載（実際は `layout` も追加済み）
- アプリが存在しない場合の404エラーハンドリング未実装パターン → `fields[.]json.tsx` および `layout[.]json.tsx` で修正済み
- `setup/app.json` でlayout保存時にINSERTとUPDATEを別クエリで実行（1クエリにできる）→ 修正済み
- `app/form/fields`では `revision` が常に `'1'` の固定値を返す（実際のappsテーブルと連動していない）
- `loader` 関数に `ActionFunctionArgs` を誤って使うパターンに注意。`loader` には `LoaderFunctionArgs`、`action` には `ActionFunctionArgs` が正しい（実行時差異はないが型として不正確）→ `fields[.]json.tsx` で修正済み
- PUT後に `last_insert_rowid()` でレコード取得していたバグは `RETURNING` 句への変更で修正済み（record[.]json.tsx）
- `RETURNING` 句を使う場合は `run()` ではなく `all<T>()` を使う（規約変更）
- UPDATE/INSERT後に `RETURNING` が0件の場合の404ガードが抜けやすい → `recordResult.length === 0` チェックを忘れずに

## 既知のアーキテクチャ決定
- インメモリSQLiteのため `finalize` でテーブルをDROP（セッションIDごとに独立）
- `singleton.server.ts` でホットリロード時もDBインスタンスを維持
- JSON型カラムはSQLiteに文字列として格納（`body JSON`, `layout JSON`）
- `fields` テーブル: 旧 `type`, `label` カラムは廃止され `body JSON` に全属性を格納。`code` カラムは検索用に残しつつ `body` にも重複して保存
- JSON path: SQLiteのJSON演算子 `body->>'$.type'` でJSONフィールドを直接クエリ可能（`query.ts`, `record[.]json.tsx` で使用）
