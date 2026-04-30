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

## プロセス管理が無効なアプリのステータスフィールド

プロセス管理 (`enable: false`) のアプリでは、`getRecord` / `getRecords` のレスポンス body に `ステータス` キー自体が**含まれない**。返るシステムフィールドは `レコード番号 / 作成者 / 更新者 / 作成日時 / 更新日時 / $id / $revision` のみ。

一方で `app/form/fields.json` には STATUS フィールド定義が `enabled: false` フラグ付きで返る:

```json
{ "type": "STATUS", "code": "ステータス", "label": "ステータス", "enabled": false }
```

**エミュレーター実装:** `handlers/process-status.ts` の `withStatusFieldRow` が `isStatusEnabled` を見て、有効時のみ仮想 STATUS フィールドを差し込む。無効時はレコードレスポンスに `ステータス` を出さないので実機と一致。`app/form/fields.json` への `enabled: false` 付き STATUS 定義返却は未対応（必要になったら別途対応）。

調査ログ（実機での確認結果, 2026-04-30）:

```
=== getRecord record keys ===
['レコード番号', '更新者', '作成者', '$revision', 'title', '更新日時', '作成日時', '$id']
=== ステータス cell === undefined
=== form/fields ステータス def ===
{"type":"STATUS","code":"ステータス","label":"ステータス","enabled":false}
```

## プロセス管理の設定・実行 API（dualMode 化に向けた制約）

実機で確認 (2026-04-30) した制約。`updateProcessManagement` (`PUT /preview/app/status.json`) + `deployApp` で設定し、`updateRecordStatus` でアクション実行する流れの注意点。

### `updateProcessManagement` の入力制約

- **`states[name].assignee` は完全省略可**。省略した場合は実機がデフォルトで `{type:"ONE", entities:[{entity:{type:"FIELD_ENTITY", code:"作成者"}}]}` を適用する（API ドキュメント通り）
- 明示的に `assignee` を書く場合の制約:
  - **先頭ステータス（index が最小）**: `type` は `"ONE"` のみ、`entities` は空 or `[{entity:{type:"FIELD_ENTITY", code:"作成者"}}]` のみ
  - 後続ステータスは `ONE` / `ALL` / `ANY` 自由
  - `CREATOR` 型エンティティは弾かれる
- `updateProcessManagement` は preview への push なので、最後に `deployApp` を呼ばないと反映されない（フィールド変更と同じデプロイにまとめれば 1 回で済む）

### アクション実行 API (`updateRecordStatus`) の `assignee` 必須条件

assignee.type の意味（[ドキュメント](https://cybozu.dev/ja/kintone/docs/rest-api/apps/settings/update-process-management-settings/) 準拠）:

- **`ONE`** = 「次のユーザーから作業者を選択」 → 遷移時に `assignee` 引数で**選ぶ必要あり**
- **`ANY`** = 「次のユーザーのうち一人」 → kintone が自動選択するので `assignee` **省略可**
- **`ALL`** = 「次のユーザー全員」 → 全員に割り当てるので `assignee` **省略可**

[`updateRecordStatus` ドキュメント](https://cybozu.dev/ja/kintone/docs/rest-api/records/update-status/) では assignee は条件必須:

1. 変更先ステータスの作業者が `ONE` で選択可能なユーザーが存在する場合
2. 最初のステータスに作業者が設定されていて、そこへ戻す場合

**state.assignee を省略すると API デフォルトで `{type:"ONE", entities:[{FIELD_ENTITY:作成者}]}` になる** ため、何も書かないと条件 1 に該当して assignee 必須。

**最も簡単な抜け道は `{type:"ONE", entities:[]}`**（kintone UI の「作業者を設定しない」相当）。`ONE` だが選択可能ユーザー 0 件なので条件 1 にも該当せず、assignee 引数を省略できる。dualMode テストではこの形を採用。

### `getProcessManagement` レスポンスの `actions[].type`

実機の `app/status.json` レスポンスでは各 action に `type: "PRIMARY"` フィールドが付く（リクエスト側では送らない読み取り専用）。エミュレーター側もレスポンス時に補完する。
- **`from` 不一致時のエラーコードは `GAIA_IL03`**:
  - ja: 「ステータスの変更に失敗しました。ほかのユーザーがステータス、またはステータスの設定を変更した可能性があります。」
  - en: "Failed to update the status. The settings or the status itself may have been changed by someone."
  - エミュレーターは当初 `GAIA_ST01` を返していたが、実機準拠で `GAIA_IL03` に揃えた
- **プロセス管理が無効なアプリで実行**すると `GAIA_ST02`:
  - ja: 「操作に失敗しました。プロセス管理機能が無効化されています。」
  - en: "Your request failed. The process management feature has been disabled."

### アクション実行後の revision

実機はアクション 1 回で revision が **+2** される（内部で多段階の更新が走る）。一方エミュレーターは +1。dualMode テストでは `>= 2` のような緩い検証にしておくとどちらでも通る。

### 一括 status 更新 (`updateRecordsStatus`) の atomicity

- 配列の途中で 1 件でも失敗すると、それまでに成功した遷移も**ロールバックされる**（先行レコードは元のステータスのまま）
- エミュレーターも `db.transaction` 内で例外を投げてロールバックする実装で実機準拠

### dualMode テストでの推奨形

```ts
// 全 state を {ONE, entities:[]} にすると updateRecordStatus で assignee 不要
const EMPTY_ASSIGNEE = { type: "ONE", entities: [] };
const STATUS_CONFIG = {
  enable: true,
  states: {
    未処理: { name: "未処理", index: "0", assignee: EMPTY_ASSIGNEE },
    処理中: { name: "処理中", index: "1", assignee: EMPTY_ASSIGNEE },
    完了:   { name: "完了",   index: "2", assignee: EMPTY_ASSIGNEE },
  },
  actions: [
    { name: "処理開始",   from: "未処理", to: "処理中" },
    { name: "完了にする", from: "処理中", to: "完了" },
  ],
};
// updateRecordStatus({ app, id, action })  ← assignee 引数不要
```
