# `@sonicgarden/kintone-emulator/test-support`

エミュレーターと実 kintone をテスト時に切り替えるためのヘルパー群。同じテストコードから `kintone-emulator` の local インスタンスにも `https://<domain>.cybozu.com` にもアクセスできるようにする。

本モジュールはテストランナー非依存で、vitest 固有の describe / test ラッパーは別エントリ `./test-support/vitest` にまとめている。

## 提供機能

### ランナー非依存（`@sonicgarden/kintone-emulator/test-support`）

| エクスポート | 役割 |
|---|---|
| `configureTestEnv(partial)` | モードや実 kintone 接続情報を注入する。テスト開始前に 1 度呼ぶ |
| `getTestEnv()` | 現在の設定を参照 |
| `isUsingRealKintone()` | `mode === "real-kintone"` なら true |
| `resetAppAssignment()` | 実 kintone 側の `appIds` 割り当てインデックスを先頭に戻す（beforeEach 等から呼ぶ） |
| `resetTestEnvironment(session)` | emulator: finalize + initialize / real: `resetAppAssignment` |
| `getTestBaseUrl(session)` | emulator は `http://<host>/<session>-<pid>`、real は `https://<domain>.cybozu.com` |
| `getTestAuth()` | emulator: `{ apiToken: "test" }` / real: `{ username, password }` |
| `getTestClient(session)` | 上記を組み合わせた `KintoneRestAPIClient` |
| `createTestApp(session, params)` | emulator: `/setup/app.json`、real: `addFormFields + deploy + addRecords` を一貫した API で実行。`{ appId, recordIds }` を返す |
| `createTestSpaceApp(session, params)` | スペース所属（通常 / ゲスト）アプリを準備。emulator は `setupSpace + createApp`、real は env の `spaceApps` / `guestSpaceApps` から指定 index を選んで setup。`{ appId, spaceId, recordIds }` を返す |
| `getTestSpaceApps()` / `getTestGuestSpaceApps()` | env で渡された通常 / ゲストスペース所属アプリ一覧を返す |
| `setupTestAuth(session, user, password)` | emulator 専用の `/setup/auth.json`（real では no-op） |
| `getTestRequestHeaders()` | raw fetch 用の認証ヘッダー。real では `X-Cybozu-Authorization`、emulator では空オブジェクト。SDK を経由せず直接 API を叩くテストで使う |
| `fieldProperty(code, type, attrs?)` | フィールド定義を作るヘルパー。type 別のデフォルト属性を補完した完全な定義を返す（実機 `getFormFields` の応答形と同じ shape）。`createTestApp` の `properties` などに渡せる |
| `applyFieldDefaults(def)` | 既存のフィールド定義に type 別のデフォルトを補完。`fieldProperty` の下位ビルディングブロック |
| `parseAppIds(raw)` / `parseSpaceApps(raw)` | env 文字列をパースするヘルパー。`"12,13,14"` → `number[]`、`"1:17,2:15"` → `SpaceAppEntry[]`。`configureTestEnv` に渡す前に使う |
| `createBaseUrl` / `initializeSession` / `finalizeSession` / `setupAuth` / `setupSpace` / `createApp` | emulator 向けの下位プリミティブ |

### vitest 固有（`@sonicgarden/kintone-emulator/test-support/vitest`）

`describe` / `test` を wrapping した便利関数。

| エクスポート | 役割 |
|---|---|
| `describeDualMode(name, fn)` | emulator / real の両モードで実行（実質 `describe` のエイリアス） |
| `describeEmulatorOnly(name, fn)` | real モード時は `describe.skip` になる |
| `testEmulatorOnly(name, fn)` | real モード時は `test.skip` になる |

jest など他ランナーで使う場合は `isUsingRealKintone()` を直接使って自分で wrapper を書く。

## 使い方

### 1. 依存関係

`@kintone/rest-api-client` を devDependency として入れる（peer dependency）。

```sh
npm i -D @sonicgarden/kintone-emulator @kintone/rest-api-client
```

### 2. モードと実機接続情報を注入（vitest の例）

```ts
// tests/setup.ts
/// <reference types="vite/client" />
import {
  configureTestEnv,
  parseAppIds,
  parseSpaceApps,
} from "@sonicgarden/kintone-emulator/test-support";

configureTestEnv({
  mode: import.meta.env.MODE,                                // "test" | "real-kintone" など
  realKintone: {
    domain:         import.meta.env.VITE_KINTONE_TEST_DOMAIN ?? "",
    user:           import.meta.env.VITE_KINTONE_TEST_USER ?? "",
    password:       import.meta.env.VITE_KINTONE_TEST_PASSWORD ?? "",
    appIds:         parseAppIds(import.meta.env.VITE_KINTONE_TEST_APP_IDS),
    // ゲストスペース対応の dualMode テストを書く場合のみ必要
    spaceApps:      parseSpaceApps(import.meta.env.VITE_KINTONE_TEST_SPACE_APP_IDS),
    guestSpaceApps: parseSpaceApps(import.meta.env.VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS),
  },
});
```

`vitest.config.ts` で `setupFiles: ["tests/setup.ts"]` を指定し、`.env.real-kintone` に VITE_KINTONE_TEST_* を書く。`vitest run --mode real-kintone` で real モード実行。

env の値の形式:

| 変数 | フォーマット | 例 | パース後 |
|---|---|---|---|
| `VITE_KINTONE_TEST_APP_IDS` | カンマ区切り数値 | `12,13,14` | `[12, 13, 14]` |
| `VITE_KINTONE_TEST_SPACE_APP_IDS` | `spaceId:appId` のカンマ区切り | `1:17,1:18,3:20` | `[{spaceId:1,appId:17}, {spaceId:1,appId:18}, {spaceId:3,appId:20}]` |
| `VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS` | 同上 | `2:15` | `[{spaceId:2,appId:15}]` |

### 2'. vitest 以外（jest / node:test 等）で使う例

```ts
// jest --globalSetup
import {
  configureTestEnv,
  parseAppIds,
  parseSpaceApps,
} from "@sonicgarden/kintone-emulator/test-support";

export default async () => {
  configureTestEnv({
    mode: process.env.TEST_MODE === "real" ? "real-kintone" : "test",
    emulatorHost: `localhost:${process.env.TEST_PORT ?? "12345"}`,
    realKintone: {
      domain:         process.env.KINTONE_DOMAIN!,
      user:           process.env.KINTONE_USER!,
      password:       process.env.KINTONE_PASSWORD!,
      appIds:         parseAppIds(process.env.KINTONE_APP_IDS),
      spaceApps:      parseSpaceApps(process.env.KINTONE_SPACE_APP_IDS),
      guestSpaceApps: parseSpaceApps(process.env.KINTONE_GUEST_SPACE_APP_IDS),
    },
  });
};
```

### 3. エミュレーターサーバーの起動（emulator モードだけ）

`kintone-emulator` は HTTP サーバーを起動して使う。サーバーのホスト/ポートを `configureTestEnv({ emulatorHost })` に渡せば、`getTestBaseUrl()` が `http://<host>/<session>-<pid>` を返す。

```ts
import { startServer } from "@sonicgarden/kintone-emulator";

const server = await startServer();  // => http.Server
const port = (server.address() as import("net").AddressInfo).port;
configureTestEnv({ emulatorHost: `localhost:${port}` });
```

`emulatorHost` 未指定時は `process.env.TEST_PORT` があればそれを参照し、なければ `localhost:12345` にフォールバック。

### 4. テスト本体

```ts
import { beforeEach, expect, test } from "vitest";
import { createTestApp, fieldProperty, getTestClient, resetTestEnvironment } from "@sonicgarden/kintone-emulator/test-support";
import { describeDualMode } from "@sonicgarden/kintone-emulator/test-support/vitest";

describeDualMode("SUBTABLE クエリ", () => {
  const SESSION = "records-subtable-query";
  let client: import("@kintone/rest-api-client").KintoneRestAPIClient;
  let appId: number;

  beforeEach(async () => {
    await resetTestEnvironment(SESSION);
    client = getTestClient(SESSION);
    ({ appId } = await createTestApp(SESSION, {
      name: "subtable query",
      properties: {
        top_title: fieldProperty("top_title", "SINGLE_LINE_TEXT"),
        items: fieldProperty("items", "SUBTABLE", {
          fields: {
            name: fieldProperty("name", "SINGLE_LINE_TEXT"),
            qty:  fieldProperty("qty",  "NUMBER"),
          },
        }),
      },
      records: [
        { top_title: { value: "r1" }, items: { value: [
          { value: { name: { value: "apple" }, qty: { value: "100" } } },
        ] } },
      ],
    }));
  });

  test("SUBTABLE 内フィールド in", async () => {
    const { records } = await client.record.getRecords({
      app: appId, query: 'name in ("apple")',
    });
    expect(records).toHaveLength(1);
  });
});
```

### 5. `fieldProperty` ヘルパー詳細

最低限 `code` と `type` を受け取り、type 別の optional 属性をデフォルトで埋めた完全な定義を返します。明示的に渡した属性はデフォルトより優先されます。

```ts
fieldProperty("title", "SINGLE_LINE_TEXT");
// → { code: "title", type: "SINGLE_LINE_TEXT", label: "title",
//      noLabel: false, required: false, minLength: "", maxLength: "",
//      expression: "", hideExpression: false, unique: false, defaultValue: "" }

fieldProperty("qty", "NUMBER", { required: true, maxValue: "100", unit: "個" });
// 指定した required/maxValue/unit が優先、他は型のデフォルト

fieldProperty("color", "RADIO_BUTTON", {
  options: { red: { label: "赤", index: "0" }, blue: { label: "青", index: "1" } },
});
// RADIO_BUTTON は実機準拠で required: true、defaultValue は最初の option キー (red)
```

`SUBTABLE` の `fields` 内の inner field も `fieldProperty()` で書けます。inner field 単体に対して `applyFieldDefaults` が再帰的に走るので、inner の `code` も同様にエントリキーから自動補完されます:

```ts
fieldProperty("items", "SUBTABLE", {
  fields: {
    name: fieldProperty("name", "SINGLE_LINE_TEXT"),
    qty:  fieldProperty("qty",  "NUMBER", { required: true }),
  },
});
```

## 実 kintone 側の事前準備

real モードを使うには、テスト用アプリを事前に作成して `appIds` プールに指定する:
- `appIds` には「1 つのテスト内で `createTestApp` が呼ばれる最大回数」を賄う個数を入れる（ルックアップ系は 2 つ必要）
- プール内のアプリは最低限何か 1 つフィールドが作成された状態で、削除してよいフィールド・レコードだけを含んでいれば十分（テスト開始時にクリーンアップされる）
- `createTestApp` の `appId` 割り当ては beforeEach で `resetAppAssignment()` を呼べば各テストで先頭から再割当される

### スペース / ゲストスペース所属アプリ

`createTestSpaceApp` を使う dualMode テストを書く場合は、追加で:
- 通常スペースを 1 つ以上作成し、その中にテスト用アプリを 1 つ以上作る → `VITE_KINTONE_TEST_SPACE_APP_IDS=<spaceId>:<appId>` で指定
- ゲストスペースを 1 つ以上作成し、その中にテスト用アプリを 1 つ以上作る → `VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS=<spaceId>:<appId>` で指定
- 同じスペース内に複数アプリを置く場合は `1:17,1:18` のようにカンマで並べる
- `createTestSpaceApp({ kind, spaceIndex, appIndex })` の `spaceIndex` は spaceId のユニーク順、`appIndex` はその space 内での登場順。env が `2:15,2:16,4:20` の場合、`spaceIndex=0` は space 2、`spaceIndex=1` は space 4 を指す
- emulator モードでは env が無くても動作する（`createTestSpaceApp` 側で動的に space を割り当てる）。env がある場合は同じ ID 構成を都度作って実機と挙動を揃える

## 実機挙動との差分

実機との差分が出る項目は `doc/real-kintone-dual-mode-followup.md` を参照。dualMode テストで両モード検証できるよう一部は emulator-only に退避している。
