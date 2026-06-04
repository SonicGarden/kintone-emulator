# `@kintone/rest-api-client` の挙動メモ

エミュレーター実装時に参照した、クライアントライブラリ `@kintone/rest-api-client` 側の挙動の記録。検証バージョン: **v5.6.0**。

実 kintone サーバーの挙動は [`kintone-behavior-notes.md`](./kintone-behavior-notes.md) を参照。

---

## 1. エラーレスポンスのハンドリング

### 関係するコード

`@kintone/rest-api-client/lib/src/KintoneResponseHandler.js` の `handleErrorResponse(error)`:

```js
const errorResponse = error.response;
const { data, ...rest } = errorResponse;
if (typeof data === "string") {
  throw new Error(`${rest.status}: ${rest.statusText}`);
}
throw new KintoneRestAPIError({ data, ...rest });
```

`@kintone/rest-api-client/lib/src/http/AxiosClient.js` は axios でリクエストして `responseHandler.handle()` に渡すだけで、**リトライ処理は無い**。

### Content-Type による分岐

axios はデフォルトで `Content-Type: application/json` のレスポンスを object にパースし、それ以外は文字列のまま `data` に入れる。`KintoneResponseHandler` はその `data` の型で投げるエラーを切り替える:

| サーバー応答 | `data` の型 | rest-api-client が投げるもの |
|---|---|---|
| **JSON ボディ** (`application/json`、`{code, id, message}` 等) | `object` | `KintoneRestAPIError`。`status` / `code` / `message` / `errors` 等のプロパティが取れる |
| **テキスト/HTML ボディ** (`text/plain` / `text/html`) | `string` | 素の `Error("${status}: ${statusText}")`。`statusText` は HTTP の標準文言（例: "Service Unavailable"）で、**ボディ文字列は含まれない** |

### 503 + テキストボディ時の具体例

サーバーが `503 Service Unavailable` をテキストボディで返したとき（実 kintone のメンテナンス時のレスポンス: <https://jp.kintone.help/general/en/login/cannot_access>）:

- `error.message` = `"503: Service Unavailable"`（HTTP の statusText。ボディの `"Service Unavailable"` は含まれない）
- `error.name` = `"Error"`（`"KintoneRestAPIError"` ではない）
- `error.status` / `error.code` / `error.errors` 等の kintone 固有プロパティは **存在しない**
- `bulkRequest` 経由でも同じ素の `Error` が伝播する（`KintoneAllRecordsError` ではない）

### 呼び出し側ハンドリングの含意

503 等のテキスト系エラーを捕捉したい場合、`instanceof KintoneRestAPIError` のチェックでは検出できない。次のいずれかでハンドリングする:

- `error.message` の正規表現マッチ（`/^503:/` 等）
- `instanceof KintoneRestAPIError` でないエラーを「ネットワーク/インフラ系」として扱う

エミュレーターはこの両経路を再現できる必要があり、`setup/failure.json` の `body` を `string | object` で受けて `Content-Type` を切り替える設計になっている（`packages/core/src/handlers/with-failure-injection.ts` 参照）。
