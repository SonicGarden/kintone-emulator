# Dual-mode テスト移行: follow-up リスト

`USE_REAL_KINTONE=1` でも実行できる dual-mode テストへの移行が未完了のブロック一覧。

## 完了済み（describeDualMode）

- `records.test.ts` > `アプリのレコード一覧のAPI` (13 tests; 削除の存在しない ID テスト 1 件は testEmulatorOnly)
- `records.test.ts` > `SUBTABLE 内フィールドでの検索クエリ` (6 tests)
- `records.test.ts` > `システムフィールドコードでの検索クエリ` (3 tests)
- `records.test.ts` > `一括 addRecords / updateRecords` (11 tests; Accept-Language en / app 欠落 raw fetch の 2 件は emulatorOnly の別ブロック)
- `record.test.ts` > `アプリのレコードAPI` (3 tests; 逐次 ID / Accept-Language / /setup/app.json の 6 件は emulatorOnly の別ブロック)
- `record.test.ts` > `unique フィールドのバリデーション` (4 tests)
- `record.test.ts` > `maxLength / minLength バリデーション` (2 tests)
- `record.test.ts` > `maxValue / minValue バリデーション` (4 tests)
- `record.test.ts` > `options 整合バリデーション` (6 tests)
- `record.test.ts` > `defaultValue / defaultNowValue の自動補完` (8 tests)
- `record.test.ts` > `SUBTABLE 対応` (10 tests; 行 id 保持テスト 1 件は testEmulatorOnly)
- `record.test.ts` > `SUBTABLE 行の追加 / 更新 / 削除（PUT マージ）` (5 tests; マージ独自挙動 2 件は testEmulatorOnly)
- `record.test.ts` > `SUBTABLE 内 NUMBER の正規化 / 非数値の扱い` (6 tests)
- `record.test.ts` > `top-level NUMBER の正規化` (4 tests)
- `record.test.ts` > `ルックアップ（LOOKUP）` (11 tests; 応答メッセージ / Accept-Language の 2 件は emulatorOnly の別ブロック)
- `record.test.ts` > `ルックアップ: relatedKeyField が RECORD_NUMBER` (3 tests)
- `records.test.ts` > `クエリのエラーレスポンス / 上限チェック` (8 tests; CB_VA01 / GAIA_QU01 / GAIA_QU02 / GAIA_IQ11 / GAIA_IQ07 / GAIA_IQ03 / GAIA_IQ10 すべて実機と一致)

合計 111 tests を実 kintone 環境で検証済み（全 pass）。

### 実機差分を発見して emulator-only に退避した項目

- **`record.test.ts` > `maxLength / minLength バリデーション（実機差分あり）`** (emulator-only)
  - 空文字は minLength 検証をスキップ → 実機では NG の可能性（要追加調査）
  - LINK に短い値を入れると minLength エラーに加えて「URL の形式が正しくありません」エラーも同時に返る → 実機のみの挙動
  - MULTI_LINE_TEXT の maxLength: 実機で独自の状態エラーが出て失敗（要追加調査）

- **`records.test.ts` > クエリの文字列リテラル**: 実機は double-quote のみ許容。`test = 'test'` は CB_VA01。エミュは single / double どちらも受け付ける → dualMode テストは double-quote に統一
- **`records.test.ts` > `getRecords` の `totalCount`**: 実機は `?totalCount=true` 指定時のみ件数を返す（デフォルト null）。エミュは常に件数を返す → テストは `records.length` で代用
- **`records.test.ts` > `レコード削除 > 存在しないレコードIDを指定してもエラーにならない`**: 実機は GAIA_RE01、エミュは 200 OK。`testEmulatorOnly` 化
- **`record.test.ts` > SUBTABLE 行に id を送ると保持される**: 実機は行 id を無視して自動採番、エミュはクライアント指定 id を保持 → `testEmulatorOnly`
- **`record.test.ts` > SUBTABLE PUT の行 id 単位マージ**: 実機は PUT で SUBTABLE 全体を置き換え、エミュは行 id 単位で内部フィールドをマージ。該当 2 テストを `testEmulatorOnly` 化
- **アプリ作成時のフィールドコード衝突**: 実機は `ステータス` (STATUS システムフィールド) / `カテゴリー` / `作業者` 等のコードを予約。ユーザーが同じコードで DROP_DOWN 等を作ろうとすると CB_VA01 → dualMode テストで使う時はリネーム必須

## 未移行（describeEmulatorOnly でタグ付け、実 kintone では skip）

### records.test.ts

| ブロック | 移行時の障壁 |
|---|---|
| `アプリのレコード一覧のAPI` | `addFormFields({app:1})` + `$id = 1` / `$id = 2` ハードコード。createTestApp + 返却 recordIds に書き換え必要 |
| `一括 addRecords / updateRecords` | `ids: ["1","2","3"]` という逐次 ID 前提が多数。実 kintone は自動採番で 1 始まりにならない |
| `クエリのエラーレスポンス / 上限チェック` | `/k/v1/preview/app/form/fields.json` を raw fetch で叩いている。実 kintone は deploy 必須。app=1 ハードコード |

### record.test.ts (残り emulator-only 2 ブロック)

| ブロック | 障壁 |
|---|---|
| `required フィールドのバリデーション` | `USER_SELECT` に `{ code: "u1" }` というダミーユーザーコード → 実機には存在しないのでエラー |
| `Accept-Language によるメッセージ切り替え` | エミュ固有のエラーメッセージ文字列を検証 |

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

**低**（実機と乖離していて価値が低いか、エミュ専用機能の検証）:
- `record.test.ts` > `required フィールドのバリデーション`（ダミー USER_SELECT コード）
- `record.test.ts` > `Accept-Language によるメッセージ切り替え`（エミュ固有エラー文言）

record.test.ts / records.test.ts の実機互換な describe ブロックはほぼ全て移行完了。残りは認証、アプリ作成、フォーム管理、file 等のエミュ専用機能テスト。

**低**（実機と乖離していて価値が低いか、エミュ専用機能の検証）:
- `auth.test.ts`（エミュ固有の /setup/auth.json）
- `app.test.ts`（/setup/app.json 由来の挙動）
- `form/layout/status.test.ts` 各種（revision / layout / status の setup 独自挙動）
- `クエリのエラーレスポンス / 上限チェック`（/k/v1/preview/... raw fetch）
- `record.test.ts` > `アプリのレコードAPI`（逐次 ID 依存）
- `record.test.ts` > `required フィールドのバリデーション`（ダミー USER_SELECT コード）
- `record.test.ts` > `Accept-Language によるメッセージ切り替え`（エミュ固有エラー文言）
