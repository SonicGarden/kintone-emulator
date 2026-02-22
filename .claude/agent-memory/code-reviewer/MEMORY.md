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
- `CLAUDE.md` / `README.md` のルーティングテーブルへの新規エンドポイント追記忘れ
- テストのセッション管理で `SESSION` 定数を使わずURLをハードコードするパターン（`form/initialize` 等）→ セッション衝突リスク
- `apps` テーブルのカラム定義がCLAUDE.mdに `name`, `revision` のみ記載（実際は `layout` も追加済み）
- アプリが存在しない場合の404エラーハンドリング未実装パターン（`app/form/layout` も同様）
- `setup/app.json` でlayout保存時にINSERTとUPDATEを別クエリで実行（1クエリにできる）→ 修正済み
- `app/form/fields`では `revision` が常に `'1'` の固定値を返す（実際のappsテーブルと連動していない）
- `app/form/layout` でapp_idが存在しない場合でも200を返す（エミュレーターとして許容範囲かもしれないが）
- PUT後に `last_insert_rowid()` でレコード取得していたバグは `RETURNING` 句への変更で修正済み（record[.]json.tsx）
- `RETURNING` 句を使う場合は `run()` ではなく `all<T>()` を使う（規約変更）
- UPDATE/INSERT後に `RETURNING` が0件の場合の404ガードが抜けやすい → `recordResult.length === 0` チェックを忘れずに

## 既知のアーキテクチャ決定
- インメモリSQLiteのため `finalize` でテーブルをDROP（セッションIDごとに独立）
- `singleton.server.ts` でホットリロード時もDBインスタンスを維持
- JSON型カラムはSQLiteに文字列として格納（`body JSON`, `layout JSON`）
- `fields` テーブル: 旧 `type`, `label` カラムは廃止され `body JSON` に全属性を格納。`code` カラムは検索用に残しつつ `body` にも重複して保存
- JSON path: SQLiteのJSON演算子 `body->>'$.type'` でJSONフィールドを直接クエリ可能（`query.ts`, `record[.]json.tsx` で使用）
