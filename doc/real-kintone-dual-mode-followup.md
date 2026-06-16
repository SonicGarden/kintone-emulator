# Dual-mode テスト移行: follow-up リスト

`vitest --mode real-kintone` でも実行できる dual-mode テストへの移行が未完了のブロック一覧。

## 完了済み（describeDualMode）

- `records-basic.test.ts` > `アプリのレコード一覧のAPI` / `一括 addRecords / updateRecords`（emulator 固有の app 欠落 raw fetch / Accept-Language en は emulatorOnly の別ブロック）
- `records-query.test.ts` > `SUBTABLE 内フィールドでの検索クエリ` / `システムフィールドコードでの検索クエリ` / `クエリのエラーレスポンス / 上限チェック`（CB_VA01 / GAIA_QU01 / GAIA_QU02 / GAIA_IQ11 / GAIA_IQ07 / GAIA_IQ03 / GAIA_IQ10 すべて実機と一致）
- `record-basic.test.ts` > `アプリのレコードAPI`（逐次 ID / Accept-Language / /setup/app.json は emulatorOnly の別ブロック）
- `record-validation.test.ts` > `required フィールドのバリデーション` / `required（各フィールドタイプ）` / `unique` / `unique 対象タイプ` / `maxLength / minLength` / `LINK の minLength` / `maxValue / minValue` / `options 整合`
- `record-defaults.test.ts` > `defaultValue / defaultNowValue の自動補完`
- `record-subtable.test.ts` > `SUBTABLE 対応` / `SUBTABLE 行の追加 / 更新 / 削除（PUT マージ）`（独自挙動の数件は testEmulatorOnly）
- `record-number.test.ts` > `SUBTABLE 内 NUMBER の正規化` / `top-level NUMBER の正規化`
- `record-lookup.test.ts` > `ルックアップ（LOOKUP）` / `ルックアップ: relatedKeyField が RECORD_NUMBER` / `SUBTABLE 内 LOOKUP`
- `calc-compute.test.ts` > CALC 評価系全ブロック（数値計算 / 比較 / 論理 / SUM / ROUND / 日付 / SLT autoCalc / CONTAINS / SUBTABLE 内 CALC / CREATED/UPDATED_TIME / CALC 連鎖）
- `comment.test.ts` > `アプリのレコードコメントAPI`（mentions 2 件は testEmulatorOnly）

### 実機差分の調査結果と対応

- **空文字 / 未送信フィールドの minLength**: 実機は `""` でも未送信でも minLength を検証して 400 を返す。エミュは元々スキップしていたが実機準拠に修正（`packages/core/src/handlers/validate.ts`）→ dualMode に統合
- **LINK の minLength**: 実機は `"2文字より長く..."` に加えて `"URL の形式が正しくありません..."` を同じ messages 配列に返す。dualMode テストでは `expect.arrayContaining` で両モードが通るように書いた
- **MULTI_LINE_TEXT の maxLength / minLength**: 実機は設定画面でも指定できない（そもそも maxLength / minLength 属性を持たないフィールド型）ため、エミュ側でも `validateLengths` の対象型から除外して API レベルの検証を廃止

- **`records.test.ts` > クエリの文字列リテラル**: 実機は double-quote のみ許容。`test = 'test'` は CB_VA01。エミュは single / double どちらも受け付ける → dualMode テストは double-quote に統一
- **`records.test.ts` > `getRecords` の `totalCount`**: 実機は `?totalCount=true` 指定時のみ件数を返す（デフォルト null）。エミュは常に件数を返す → テストは `records.length` で代用
- **`records.test.ts` > `レコード削除 > 存在しないレコードIDを指定してもエラーにならない`**: 実機は GAIA_RE01、エミュは 200 OK。`testEmulatorOnly` 化
- **`record.test.ts` > SUBTABLE 行に id を送ると保持される**: 実機は行 id を無視して自動採番、エミュはクライアント指定 id を保持 → `testEmulatorOnly`
- **`record.test.ts` > SUBTABLE PUT の行 id 単位マージ**: 実機は PUT で SUBTABLE 全体を置き換え、エミュは行 id 単位で内部フィールドをマージ。該当 2 テストを `testEmulatorOnly` 化
- **アプリ作成時のフィールドコード衝突**: 実機は `ステータス` (STATUS システムフィールド) / `カテゴリー` / `作業者` 等のコードを予約。ユーザーが同じコードで DROP_DOWN 等を作ろうとすると CB_VA01 → dualMode テストで使う時はリネーム必須
- **コメントテキストの末尾空白付加**: 実機は `addRecordComment({comment: {text: "コメント2"}})` に対して `getRecordComments` の返却 text を `"コメント2 "` のように末尾空白付きで返す。エミュは入力値そのまま。dualMode テストでは `.trim()` で正規化して比較

### `real-kintone.ts` で見つかった実装バグ

- **フィールド定義ハッシュがネストを無視していた**: `JSON.stringify(obj, Object.keys(obj).sort())` の replacer array は全階層に作用し、ネストされたオブジェクトのプロパティを落として `{"items":{},"top_title":{}}` のような骨格だけになっていた。結果、トップレベルキーが同じだがネストスキーマが違う 2 ブロック（例: SUBTABLE 対応 → SUBTABLE 行 PUT）でハッシュが誤一致し、deploy がスキップされて前ブロックの schema が残っていた。`sortKeysDeep` で再帰ソート + フル stringify に変更して修正済み

## 未移行（describeEmulatorOnly でタグ付け、実 kintone では skip）

### records-basic.test.ts

| ブロック | 移行時の障壁 |
|---|---|
| `アプリのレコード一覧のAPI`（emulator 固有部） | `addFormFields({app:1})` + `$id = 1` / `$id = 2` ハードコード |
| `一括 addRecords / updateRecords`（emulator 固有部） | `ids: ["1","2","3"]` という逐次 ID 前提。実 kintone は自動採番で 1 始まりにならない |

### record-basic.test.ts

| ブロック | 障壁 |
|---|---|
| `アプリのレコードAPI（emulator 固有）` | 逐次 ID 依存、`/setup/app.json` の $id ハードコード |

### record-locale.test.ts

| ブロック | 障壁 |
|---|---|
| `Accept-Language によるメッセージ切り替え` | エミュ固有のエラーメッセージ文字列を検証 |

### app/calc-validation.test.ts

| ブロック | 障壁 |
|---|---|
| `CALC / 文字列 autoCalc バリデーション` | `/k/v1/preview/app/form/fields.json` を raw fetch で叩いて即時応答を検証。実機は deploy が必須で挙動が異なる |

### comment.test.ts

| ブロック | 障壁 |
|---|---|
| `アプリのレコードコメントAPI` | app=1 ハードコード、`mentions` に `{ code: "user1" }` 等のダミーユーザーコード |

### auth.test.ts

| ブロック | 障壁 |
|---|---|
| `パスワード認証` | `/setup/auth.json` エンドポイントはエミュレーター独自 (実機は常に認証必須) |

実機の認証挙動は `tests/contract/auth.test.ts` 側で別 env (`KINTONE_TEST_DOMAIN/USER/PASSWORD` 単体) で検証する運用。

### app.test.ts

| ブロック | 障壁 |
|---|---|
| `アプリ作成API` | `/setup/app.json` で ID 指定、revision 検証 → 実機には無い挙動 |
| `アプリ情報取得API` | 同上 |

### app/form.test.ts, layout.test.ts, status.test.ts

| ファイル | 障壁 |
|---|---|
| form.test.ts | `revision: "1"` ハードコード検証。実機の revision は deploy ごとにインクリメント |
| layout.test.ts | `createApp(layout: [...])` で任意 layout 投入 → 実機は `addFormFields` + deploy 経由でしか定義できない |
| status.test.ts | `createApp(status: {...})` でプロセス管理定義 → 実機では GUI / 独自 API 経由が必要 |

### file.test.ts

| ブロック | 障壁 |
|---|---|
| `FILE フィールド関連` | 実機では FILE 値が実際のファイル ID を返す。テストで `fileKey` の形式や downloadFile 動作を検証 → 移行候補だがアプリに FILE フィールドが必要 |

## 次フェーズの優先順位案

record-*.test.ts / records-*.test.ts / comment.test.ts / calc-compute.test.ts の実機互換な describe ブロックはすべて移行完了。残りはエミュ専用機能のテスト:

- `auth.test.ts`（エミュ固有の /setup/auth.json）
- `app.test.ts`（/setup/app.json 由来の挙動）
- `form/layout/status.test.ts` 各種（revision / layout / status の setup 独自挙動）
- `file.test.ts`（`/k/v1/file.json` のアップロード API 自体は実機でも動くが優先度低）
- `record-basic.test.ts` > `アプリのレコードAPI (emulator 固有)`（逐次 ID 依存）
- `record-locale.test.ts`（エミュ固有エラー文言）
- `app/calc-validation.test.ts`（preview/app/form/fields.json の即時応答検証）
