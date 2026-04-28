# 実 kintone との挙動差・注意点

実機 kintone と直接通信する dualMode テストや調査を進める上で気付いた、エミュレーター実装側で見落としやすい挙動を記録する。

## ユーザー言語設定が「Webブラウザーの設定に従う」のときの Accept-Language 依存

`packages/core/.env.real-kintone` のテストアカウントは **ユーザー言語設定が「Webブラウザーの設定に従う」** になっている。このとき REST API のエラーメッセージは Accept-Language ヘッダーで切り替わる:

| Accept-Language | レスポンス例 |
|---|---|
| `ja` 明示 | `"必須です。"` / `"入力内容が正しくありません。"` |
| ヘッダー無し | `"Required field."` / `"Missing or invalid input."` |

エミュレーター側は「Accept-Language 無し → ja」のフォールバックを採用している（コミット `0cc7617`）ため、明示しないと実機との比較で文字列が食い違う。

**過去に同じ落とし穴を踏んだ箇所:**

- 429 (rate-limit) エラーのメッセージ
- `CB_VA01` (必須パラメーター欠落) のメッセージ

**対策:** dualMode テストで raw fetch を使うときは `Accept-Language: ja` を必ず付ける。`tests/api/required-params.test.ts` の `beforeEach` で `headers = { ...getTestRequestHeaders(), "Accept-Language": "ja" }` としているのが参考実装。
