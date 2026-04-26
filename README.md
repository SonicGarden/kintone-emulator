# kintone-emulator

kintone の REST API をローカルでエミュレートするサーバーです。実際の kintone 環境なしに、kintone アプリの開発・テストができます。

## 特徴

- **kintone REST API 互換** — `@kintone/rest-api-client` をそのまま使ってリクエスト可能
- **セッション分離** — URL プレフィックスでセッションを分けられるため、テストの並列実行に対応
- **インメモリ SQLite** — 起動が速く、テスト後にデータが残らない
- **kintone クエリ構文に対応** — 独自パーサー（`packages/core/src/query/`）で `=`, `!=`, `<`, `>`, `<=`, `>=`, `in`, `not in`, `like`, `not like`, `is empty`, `is not empty`, `and`, `or`, グループ化 `()` を解釈。`order by` / `limit` / `offset` と、主要な日時関数（`NOW()`, `TODAY()`, `YESTERDAY()`, `TOMORROW()`, `FROM_TODAY()`, `THIS_WEEK()`, `LAST_WEEK()`, `NEXT_WEEK()`, `THIS_MONTH()`, `LAST_MONTH()`, `NEXT_MONTH()`, `THIS_YEAR()`, `LAST_YEAR()`, `NEXT_YEAR()`）をサポート
- **フィールド定義に基づく入力検証** — `required` / `unique` / `maxLength` / `minLength` / `maxValue` / `minValue` / `options` 整合をチェック
- **defaultValue / defaultNowValue の自動補完** — POST 時に未送信フィールドを補完（DATE/DATETIME/TIME は現在時刻も可）
- **SUBTABLE 対応** — 入れ子フィールドの検証・defaultValue 補完・行 id 自動採番・PUT マージ（`id` で既存行を特定）
- **ルックアップ（LOOKUP）対応** — POST/PUT 時に参照先アプリからキー検索して `fieldMappings` に従い自動コピー（top-level / SUBTABLE 内の両方）
- **CALC フィールドの式評価** — 演算子（`+ - * / ^ & = != <> < <= > >=`）と 11 関数（`SUM` / `IF` / `AND` / `OR` / `NOT` / `ROUND` / `ROUNDUP` / `ROUNDDOWN` / `YEN` / `DATE_FORMAT` / `CONTAINS`）、format 別出力（`NUMBER` / `NUMBER_DIGIT` / `DATETIME` / `DATE` / `TIME` / `HOUR_MINUTE` / `DAY_HOUR_MINUTE`）、SINGLE_LINE_TEXT の autoCalc、SUBTABLE 内 CALC の行単位評価をサポート。deploy 時に式の構文・参照・循環をチェック（`GAIA_IL01`）
- **実 kintone 準拠のエラーレスポンス** — `CB_VA01` / `GAIA_RE01` / `GAIA_AP01` / `GAIA_BL01` / `GAIA_RE02` / `GAIA_LO04` / `GAIA_IL01` を `Accept-Language` で ja/en 切替

## パッケージ構成

```
packages/
├── cli/    (@sonicgarden/kintone-emulator-cli)    CLI ツール（export-app など）
├── core/   (@sonicgarden/kintone-emulator)   DB・ハンドラー・インプロセスサーバー・テスト
└── server/ (@sonicgarden/kintone-emulator-server) Remix サーバー・ルート・E2Eテスト
```

## エミュレートしている API

| メソッド | エンドポイント | 内容 |
|---|---|---|
| GET | `/k/v1/app.json` | アプリ情報取得 |
| GET | `/k/v1/apps.json` | アプリ一覧取得（`ids`, `name`, `offset`, `limit` 対応） |
| GET | `/k/v1/app/form/fields.json` | フォームフィールド取得 |
| GET | `/k/v1/app/form/layout.json` | フォームレイアウト取得 |
| POST | `/k/v1/preview/app/form/fields.json` | フォームフィールド追加 |
| DELETE | `/k/v1/preview/app/form/fields.json` | フォームフィールド削除 |
| GET | `/k/v1/app/status.json` | プロセス管理の設定取得 |
| GET | `/k/v1/record.json` | レコード取得 |
| POST | `/k/v1/record.json` | レコード追加 |
| PUT | `/k/v1/record.json` | レコード更新 |
| GET | `/k/v1/records.json` | レコード一覧取得（クエリ対応） |
| POST | `/k/v1/records.json` | レコード一括追加（最大 100 件・全件ロールバック） |
| PUT | `/k/v1/records.json` | レコード一括更新（最大 100 件・全件ロールバック） |
| DELETE | `/k/v1/records.json` | レコード一括削除 |
| GET | `/k/v1/record/comments.json` | コメント一覧取得 |
| POST | `/k/v1/record/comment.json` | コメント追加 |
| DELETE | `/k/v1/record/comment.json` | コメント削除 |
| GET | `/k/v1/file.json` | ファイルダウンロード |
| POST | `/k/v1/file.json` | ファイルアップロード |

### 認証

デフォルトでは認証なしで全 API にアクセスできます。テストサポート API でユーザーを登録すると、kintone 互換のパスワード認証（`X-Cybozu-Authorization` ヘッダー）が有効になります。

- 認証ヘッダーなし → `401` / `CB_AU01`
- 認証失敗 → `401` / `CB_WA01`
- エラーメッセージは `Accept-Language` ヘッダーで日本語・英語が切り替わります

### フィールド検証 / defaultValue / SUBTABLE / ルックアップ

POST `/k/v1/record.json` などレコード書き込み系 API は、フォームのフィールド定義に基づいた入力検証を行います。違反があれば `CB_VA01` / `入力内容が正しくありません。` の 400 を返します。

| 属性 | 対象タイプ | 挙動 |
|---|---|---|
| `required: true` | ほぼ全タイプ | 未送信 / `null` / `""` / `[]` で必須エラー |
| `unique: true` | スカラー系 | 他レコードとの重複で 400。PUT は自レコードを除外 |
| `maxLength` / `minLength` | `SINGLE_LINE_TEXT` / `MULTI_LINE_TEXT` / `LINK` | 超過 / 未満で 400 |
| `maxValue` / `minValue` | `NUMBER` | 超過 / 未満で 400 |
| 非数値（top-level） | `NUMBER` | `record[<code>].value: "数字でなければなりません。"` で 400 |
| `options` 整合 | `RADIO_BUTTON` / `DROP_DOWN` / `CHECK_BOX` / `MULTI_SELECT` | 選択肢外の値で 400（配列系は `values[<i>].value` 形式のキー） |
| `defaultValue` / `defaultNowValue` | 各種 | POST 時に未送信フィールドを補完（明示的な `""` / `[]` は尊重して補完しない） |

SUBTABLE は内部フィールドにも上記の検証・defaultValue 補完が再帰適用されます。errors キーは `record.<subCode>.value[<rowIndex>].value.<innerCode>.<suffix>` 形式。PUT では送信された行 `id` で既存行を特定してマージ、`id` なし行は新規採番、送信に含まれない既存行は削除されます。

**ルックアップ（LOOKUP）** は `lookup.fieldMappings` に従って POST/PUT 時に参照先アプリから自動コピーします:

- ルックアップキー一致 → コピー先 `field` が参照先レコードの `relatedField` の値で埋まる（クライアントが送った値は無視）
- キー不一致 → `GAIA_LO04` で 400
- キーが空文字 → コピー先もクリア
- PUT でキー変更 → コピー先を再コピー
- PUT でキー未送信 → 既存のコピー先を保持
- マスター側の値変更はコピー時点のスナップショットで伝播しない
- 一括 API は 1 件でも不一致なら全件ロールバック

SUBTABLE 内 LOOKUP も同様に動作し、各行のキー値ごとに同じ行のコピー先を埋めます。`relatedKeyField` に `レコード番号`（RECORD_NUMBER 型フィールド）を指定した参照もサポート。ただし `filterCond` / `sort` による参照先絞り込みは未対応。

**CALC フィールド** はレコード書き込み時に式が評価され、結果が `value` として保存されます。空 NUMBER は 0 扱い、0 除算など計算不能な場合は `value: ""`、CALC が文字列を返したケース（`format` が数値系の場合）も `""`。文字列を返したい場合は `SINGLE_LINE_TEXT` の `expression` を使います。SUBTABLE 内 CALC は各行で「top-level の全フィールド + 同じ行の inner」をスコープに評価。詳細な挙動は [`doc/kintone-calc-behavior.md`](doc/kintone-calc-behavior.md) 参照。

検証メッセージは日本語・英語を実機から採取した文字列に合わせています（`Accept-Language` で切替）。

### テストサポート API

| メソッド | エンドポイント | 内容 |
|---|---|---|
| POST | `/[session]/initialize` | テーブルの初期化（テスト前に実行） |
| POST | `/[session]/finalize` | テーブルの削除（テスト後に実行） |
| POST | `/[session]/setup/app.json` | テスト用アプリの作成（`name`, `properties`, `layout`, `status`, `records` を指定可能）。レスポンスに `app`, `revision`, `recordIds` を返す。`properties` のシステムフィールド（RECORD_NUMBER / CREATED_TIME / UPDATED_TIME）は明示していなければ自動補完される（既定コード: `レコード番号` / `作成日時` / `更新日時`） |
| POST | `/[session]/setup/auth.json` | 認証ユーザーの登録（`username`, `password`）。1人以上登録すると認証が有効になる |

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

### 実 kintone に対してテストを流す

同じテストコードをエミュレーターと実 kintone の両方で走らせる仕組みを `@sonicgarden/kintone-emulator/test-support` で提供しています。`describeDualMode` でマークされたブロックだけが実 kintone 環境で実行され、`describeEmulatorOnly` のブロックは skip されます（エミュレーターの挙動が実機と一致しているか検証するのに使える）。

#### このリポジトリ内で使う

1. `packages/core/.env.real-kintone.sample` をコピーして `packages/core/.env.real-kintone` を作る（`.env.*` は `.gitignore` 済み、`.env.*.sample` だけ tracked）:
   ```sh
   cp packages/core/.env.real-kintone.sample packages/core/.env.real-kintone
   ```
2. 以下の環境変数を設定（`VITE_` プレフィックス必須、vite のデフォルト挙動を利用しているため）:

   | 変数 | 例 | 用途 |
   |---|---|---|
   | `VITE_KINTONE_TEST_DOMAIN` | `my-tenant` | `https://<domain>.cybozu.com` のサブドメイン |
   | `VITE_KINTONE_TEST_USER` | `foo@example.com` | アプリ管理権限を持つユーザー |
   | `VITE_KINTONE_TEST_PASSWORD` | `...` | パスワード |
   | `VITE_KINTONE_TEST_APP_IDS` | `9,10,11` | 事前に作成しておくテスト用アプリ ID のプール |

   `VITE_KINTONE_TEST_APP_IDS` は「**1 つのテスト内で `createTestApp` が呼ばれる最大回数**」を賄える個数が必要です（ルックアップ系テストでは 2 アプリ使用）。各テスト前にアプリ ID の割り当ては先頭に戻るため、テスト間では使い回しが効きます。プール内のアプリは最低限何か 1 つフィールドが作成された状態で、削除してよいフィールド・レコードを含んでいれば十分です。

3. 実行:
   ```sh
   pnpm test:real-kintone                                    # 全 dualMode テスト
   pnpm test:real-kintone -- -t "SUBTABLE"                   # テスト名フィルタ
   pnpm test:real-kintone tests/api/record/record.test.ts    # 特定ファイル
   ```

   内部的には `vitest --mode real-kintone` が走り、`.env.real-kintone` が vite のデフォルト `.env.<mode>` 機構で `import.meta.env` にロードされます（追加の npm パッケージは不要）。フィールド定義が前回と同じなら deploy をスキップしてキャッシュするため、クエリ系テストは 2 回目以降高速化されます（初回だけ 10 秒前後）。

#### 外部プロジェクトから使う

`@sonicgarden/kintone-emulator/test-support` を import すれば、他のプロジェクトでも同じ dualMode 切替が使えます。vitest 非依存で、jest / node:test 等でも動作します。詳細・API 一覧・セットアップ手順は [`doc/test-support.md`](doc/test-support.md) 参照。

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
    records: [
      { title: { value: "サンプル1" } },
      { title: { value: "サンプル2" } },
    ],
  }),
});
const { app } = await setupRes.json();

// 認証を有効にする場合（省略可）
await fetch(`${BASE_URL}/setup/auth.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "secret" }),
});

// @kintone/rest-api-client をそのまま使用
const client = new KintoneRestAPIClient({
  baseUrl: BASE_URL,
  // 認証を有効にした場合はパスワード認証を使用
  auth: { username: "admin", password: "secret" },
  // 認証なしの場合はダミーのAPIトークンでOK
  // auth: { apiToken: "dummy" },
});

await client.record.addRecord({ app, record: { title: { value: "test" } } });

// クリーンアップ
await fetch(`${BASE_URL}/finalize`, { method: "POST" });
```

## @sonicgarden/kintone-emulator をライブラリとして使う

インプロセスサーバーをプログラムから起動することもできます。

```ts
import { startServer } from "@sonicgarden/kintone-emulator";

const { port, close } = await startServer();
// port に自動割り当てられたポート番号が入る
// ...
await close();
```

## core パッケージの tarball 生成

`@sonicgarden/kintone-emulator` を tarball として出力します。`prepack` フックで自動的にビルドが実行されます。

```sh
pnpm --filter @sonicgarden/kintone-emulator pack
```

## CLI ツール

実際の kintone 環境からアプリ定義をエクスポートし、`setup/app.json` で使える JSON を生成します。

```sh
npx --package @sonicgarden/kintone-emulator-cli sg-kintone export-app \
  --base-url https://example.cybozu.com \
  --username user --password pass --app 123
```

stdout に JSON が出力されるので、ファイルにリダイレクトして使えます。

```sh
npx --package @sonicgarden/kintone-emulator-cli sg-kintone export-app \
  --base-url https://example.cybozu.com \
  --username user --password pass --app 123 > app-definition.json
```

## 未実装・不完全な機能

本エミュレーターは実 kintone の全挙動を再現しているわけではありません。把握している差分は以下の通り。必要な項目があれば issue か PR でご連絡ください。

### 未実装のエンドポイント / 機能

- `/k/v1/record/assignees.json` 等の**プロセス管理系 API**（`STATUS` / `STATUS_ASSIGNEE` は読み出しのみ対応、遷移・割当操作は未実装）
- `/k/v1/app/settings.json` / `/k/v1/app/views.json` / `/k/v1/app/customize.json` などの**アプリ設定系 API**
- `/k/v1/preview/app/deploy.json` と `preview` 状態の分離（エミュレーターはデプロイ概念を持たず即時反映）
- **ゲストスペース** (`/k/guest/<id>/v1/...`) のパス
- **リビジョン（楽観的ロック）** — `PUT /k/v1/record.json` の `revision` パラメーターは無視される（不一致でもエラーにならない）
- **OAuth / セッション認証** — API トークン認証 / パスワード認証のみサポート
- **`lang` クエリパラメーター** — `GET /k/v1/app/form/fields.json?lang=...` の多言語ラベル対応
- **`LOOKUP` の `filterCond` / `sort`** — 参照先レコードの絞り込み・ソートは未対応
- **アプリコード機能全般** — 参照先アプリにアプリコードを設定したり、`lookup.relatedApp.code` を参照先アプリのアプリコードと同期させたりする仕組みは未実装（エミュレーターは保存された値をそのまま返すだけで、アプリコード変更への追従もなし）
- **`REFERENCE_TABLE` の動的参照**
- **CALC の型不整合 deploy 時検出** — 演算子・関数の型不一致や「配列型関数エラー」は実機が deploy 時に GAIA_IL01 で拒否するが、エミュレーターは deploy を通過し実行時に `""` で代用する

### 検証が不完全な機能

- **`LINK` の `protocol` 形式検証** — `WEB` / `MAIL` / `CALL` の形式チェックは未実装
- **SUBTABLE 内フィールドの `unique`** — 実機でもサブテーブル内に `unique` は設定できないが、意図的に設定された場合エミュレーターは検証しない
- **行ごとのエラーキー接頭辞** — バリデーションエラーのキー接頭辞は実機準拠だが、**サブテーブル内の USER_SELECT / ORGANIZATION_SELECT / GROUP_SELECT の `.values.value` 形式**は実機と差がある可能性（未検証）
- **`SUBTABLE` 内の `DATE` / `DATETIME` / `TIME` の形式検証** — 形式違反のチェックは未実装
- **`record/comment.json` DELETE 時の `app` / `record` 存在チェック** — 実機は存在しない app / record に対して `GAIA_AP01` / `GAIA_RE01` を返すが、エミュレーターは素通しで 200 を返す（`records.json` DELETE は実機準拠で GAIA_RE01 を返す）

### 検索クエリ（`/k/v1/records.json` GET）

独自パーサー（`packages/core/src/query/`）でほぼすべての演算子・関数・オプションをサポート。実機挙動との主な差分:

- `like` / `not like` は SQLite の LIKE `%...%` で部分一致として代用（実 kintone は単語検索・添付ファイル内検索など独自挙動あり）
- `LOGINUSER()` / `PRIMARY_ORGANIZATION()` はパーサー自体は対応しているが、ハンドラー層で認証ユーザー情報を `ExpandContext` に渡す仕組みが未実装のため、実行すると「要設定」エラー
- 関連レコードの参照記法（`Company.Name` のような入れ子フィールド）は未対応
- SUBTABLE 内フィールド参照は実装済み（`in` / `not in` / `>` / `<` / `>=` / `<=` / `like` / `not like` / `is empty` / `is not empty` を EXISTS サブクエリで評価）。同一 SUBTABLE 内の positive 条件の AND は単一 EXISTS にマージして実機と同じ「同一行制約」を表現する
- DATETIME と `TODAY()` などの範囲関数の組み合わせはサーバータイムゾーン依存（実機は JST 基準で「今日」を判定、エミュレーターはローカル TZ で判定）

実機観察メモ: [`doc/kintone-query-behavior.md`](doc/kintone-query-behavior.md)

### エラーレスポンスの差分（エミュレーター固有）

- **行 ID の実装差**: SUBTABLE 行 id はエミュレーターでは `crypto.randomBytes(6).toString("hex")` の 12 文字の hex 文字列を採番。実機は数値連番
- **エラー `id` の実装差**: エミュレーターは `crypto.randomBytes(15).toString("base64url")` を使用。実機のフォーマットとは異なるが、テストで `id` の値を検証することは稀

### その他の差分

- **作成者 / 更新者 / カテゴリー / ステータス / 作業者（CREATOR / MODIFIER / CATEGORY / STATUS / STATUS_ASSIGNEE）** — 実機はアプリ作成時にこれらのシステムフィールドが自動的に存在し、レコード取得時もフィールドコードで値が返るが、本エミュレーターは未対応:
  - `setup/app.json` での自動補完は RECORD_NUMBER / CREATED_TIME / UPDATED_TIME のみ
  - レコード取得レスポンスに含まれない
  - `CREATOR` / `MODIFIER` をフィールドとして明示的に追加した場合も値は埋まらない
  - `STATUS_ASSIGNEE` の更新やプロセス管理はできない
- **ファイルアップロード** — 大きなファイル・ファイル名エンコーディング（RFC 5987 の `filename*=`）の挙動は未確認
- **ファイルサイズ上限** — 実機は 1GB などの制限があるがエミュレーターには制限なし

詳細な実機挙動の観察メモは [`doc/kintone-behavior-notes.md`](doc/kintone-behavior-notes.md) を参照。

## 技術スタック

- [Remix](https://remix.run/) — サーバーフレームワーク（`packages/server`）
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — インメモリデータストア
- [Tailwind CSS](https://tailwindcss.com/) — スタイリング
- [@kintone/rest-api-client](https://github.com/kintone/js-sdk) — 型定義・クライアント（devDependencies）
