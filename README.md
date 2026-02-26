# kintone-emulator

kintone の REST API をローカルでエミュレートするサーバーです。実際の kintone 環境なしに、kintone アプリの開発・テストができます。

## 特徴

- **kintone REST API 互換** — `@kintone/rest-api-client` をそのまま使ってリクエスト可能
- **セッション分離** — URL プレフィックスでセッションを分けられるため、テストの並列実行に対応
- **インメモリ SQLite** — 起動が速く、テスト後にデータが残らない
- **kintone クエリ構文に対応** — `=`, `!=`, `<`, `>`, `order by`, `limit`, `NOW()`, `$id` など

## パッケージ構成

```
packages/
├── core/   (@kintone-emulator/core)   DB・ハンドラー・インプロセスサーバー・テスト
└── server/ (@kintone-emulator/server) Remix サーバー・ルート・E2Eテスト
```

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
| POST | `/k/v1/preview/app/form/fields.json` | フォームフィールド追加 |
| DELETE | `/k/v1/preview/app/form/fields.json` | フォームフィールド削除 |
| GET | `/k/v1/file.json` | ファイルダウンロード |
| POST | `/k/v1/file.json` | ファイルアップロード |
| POST | `/k/v1/record/comment.json` | コメント追加 |
| DELETE | `/k/v1/record/comment.json` | コメント削除 |
| GET | `/k/v1/record/comments.json` | コメント一覧取得 |
| DELETE | `/k/v1/records.json` | レコード一括削除 |
| GET | `/k/v1/app/status.json` | プロセス管理の設定取得 |

### テストサポート API

| メソッド | エンドポイント | 内容 |
|---|---|---|
| POST | `/[session]/initialize` | テーブルの初期化（テスト前に実行） |
| POST | `/[session]/finalize` | テーブルの削除（テスト後に実行） |
| POST | `/[session]/setup/app.json` | テスト用アプリの作成（`name`, `properties`, `layout`, `status` を指定可能） |

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

インプロセスサーバーを自動起動してテストを実行:

```sh
pnpm test
```

ウォッチモード:

```sh
pnpm test:watch
```

E2E テスト（事前に `pnpm build` が必要）:

```sh
pnpm test:e2e
```

## セッションの使い方

URL の先頭にセッション名を付けることで、テストごとに独立したデータベースを使用できます。

```ts
const SESSION = "my-test-session";
const BASE_URL = `http://localhost:12345/${SESSION}`;

// 初期化
await fetch(`${BASE_URL}/initialize`, { method: "POST" });

// テスト用アプリの作成
const setupRes = await fetch(`${BASE_URL}/setup/app.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "テストアプリ",
    properties: {
      title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
    },
  }),
});
const { app } = await setupRes.json();

// @kintone/rest-api-client をそのまま使用
const client = new KintoneRestAPIClient({
  baseUrl: BASE_URL,
  auth: { apiToken: "dummy" },
});

await client.record.addRecord({ app, record: { title: { value: "test" } } });

// クリーンアップ
await fetch(`${BASE_URL}/finalize`, { method: "POST" });
```

## @kintone-emulator/core をライブラリとして使う

インプロセスサーバーをプログラムから起動することもできます。

```ts
import { startServer } from "@kintone-emulator/core";

const { port, close } = await startServer();
// port に自動割り当てられたポート番号が入る
// ...
await close();
```

## core パッケージの tarball 生成

`@kintone-emulator/core` を tarball として出力します。`prepack` フックで自動的にビルドが実行されます。

```sh
pnpm --filter @kintone-emulator/core pack
```

## 技術スタック

- [Remix](https://remix.run/) — サーバーフレームワーク（`packages/server`）
- [SQLite (sqlite3)](https://github.com/TryGhost/node-sqlite3) — インメモリデータストア
- [Tailwind CSS](https://tailwindcss.com/) — スタイリング
- [@kintone/rest-api-client](https://github.com/kintone/js-sdk) — 型定義・クライアント（devDependencies）
