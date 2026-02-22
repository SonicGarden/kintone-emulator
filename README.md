# kintone-emulator

kintone の REST API をローカルでエミュレートするサーバーです。実際の kintone 環境なしに、kintone アプリの開発・テストができます。

## 特徴

- **kintone REST API 互換** — `@kintone/rest-api-client` をそのまま使ってリクエスト可能
- **セッション分離** — URL プレフィックスでセッションを分けられるため、テストの並列実行に対応
- **インメモリ SQLite** — 起動が速く、テスト後にデータが残らない
- **kintone クエリ構文に対応** — `=`, `!=`, `<`, `>`, `order by`, `limit`, `NOW()`, `$id` など

## エミュレートしている API

| メソッド | エンドポイント | 内容 |
|---|---|---|
| GET | `/k/v1/record.json` | レコード取得 |
| POST | `/k/v1/record.json` | レコード追加 |
| PUT | `/k/v1/record.json` | レコード更新 |
| GET | `/k/v1/records.json` | レコード一覧取得（クエリ対応） |
| GET | `/k/v1/app.json` | アプリ情報取得 |
| GET | `/k/v1/apps.json` | アプリ一覧取得（`ids`, `name`, `offset`, `limit` 対応） |
| GET | `/k/v1/app/form/fields.json` | フォームフィールド取得 |
| GET | `/k/v1/app/form/layout.json` | フォームレイアウト取得 |
| POST | `/k/v1/app/form/fields.json` | フォームフィールド追加 |
| GET | `/k/v1/preview/app/form/fields.json` | プレビュー版フォームフィールド取得 |
| GET | `/k/v1/file.json` | ファイルダウンロード |
| POST | `/k/v1/file.json` | ファイルアップロード |

### テストサポート API

| メソッド | エンドポイント | 内容 |
|---|---|---|
| POST | `/[session]/initialize` | テーブルの初期化（テスト前に実行） |
| POST | `/[session]/finalize` | テーブルの削除（テスト後に実行） |
| POST | `/[session]/setup/app.json` | テスト用アプリの作成（`name`, `properties`, `layout` を指定可能） |

## セットアップ

```sh
pnpm install
```

## 起動

```sh
pnpm dev      # 開発サーバー（ポート 12345）
pnpm start    # 本番サーバー（要ビルド）
```

## テスト

サーバーの起動〜テスト実行〜停止を一括で行うコマンド:

```sh
pnpm run exec
```

ウォッチモードでのテスト（サーバーは別途起動が必要）:

```sh
pnpm test:watch
```

## セッションの使い方

URL の先頭にセッション名を付けることで、テストごとに独立したデータベースを使用できます。

```ts
const SESSION = "my-test-session";
const BASE_URL = `http://localhost:12345/${SESSION}`;

// 初期化
await fetch(`${BASE_URL}/initialize`, { method: "POST" });

// @kintone/rest-api-client をそのまま使用
const client = new KintoneRestAPIClient({
  baseUrl: BASE_URL,
  auth: { apiToken: "dummy" },
});

await client.record.addRecord({ app: 1, record: { title: { value: "test" } } });

// クリーンアップ
await fetch(`${BASE_URL}/finalize`, { method: "POST" });
```

## 技術スタック

- [Remix](https://remix.run/) — サーバーフレームワーク
- [SQLite (sqlite3)](https://github.com/TryGhost/node-sqlite3) — インメモリデータストア
- [Tailwind CSS](https://tailwindcss.com/) — スタイリング
- [@kintone/rest-api-client](https://github.com/kintone/js-sdk) — 型定義・クライアント（devDependencies）
