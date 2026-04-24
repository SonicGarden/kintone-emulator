# Dual-mode テスト移行: follow-up リスト

`USE_REAL_KINTONE=1` でも実行できる dual-mode テストへの移行が未完了のブロック一覧。

## 完了済み（describeDualMode）

- `records.test.ts` > `SUBTABLE 内フィールドでの検索クエリ` (6 tests)
- `records.test.ts` > `システムフィールドコードでの検索クエリ` (3 tests)

実 kintone 環境で 9/9 pass 済み。

## 未移行（describeEmulatorOnly でタグ付け、実 kintone では skip）

### records.test.ts

| ブロック | 移行時の障壁 |
|---|---|
| `アプリのレコード一覧のAPI` | `addFormFields({app:1})` + `$id = 1` / `$id = 2` ハードコード。createTestApp + 返却 recordIds に書き換え必要 |
| `一括 addRecords / updateRecords` | `ids: ["1","2","3"]` という逐次 ID 前提が多数。実 kintone は自動採番で 1 始まりにならない |
| `クエリのエラーレスポンス / 上限チェック` | `/k/v1/preview/app/form/fields.json` を raw fetch で叩いている。実 kintone は deploy 必須。app=1 ハードコード |

### record.test.ts (14 ブロック、94 tests、全て emulator-only)

共通の障壁: `addFormFields({app:1})` + raw fetch でのエラー検証。個別の追加課題:

| ブロック | 追加障壁 |
|---|---|
| `アプリのレコードAPI` | 特になし。createTestApp 化で移行可能 |
| `required フィールドのバリデーション` | `USER_SELECT` に `{ code: "u1" }` というダミーユーザーコード → 実機には存在しないのでエラー |
| `unique / maxLength / minLength / maxValue / minValue` | createTestApp 化で移行可能 |
| `options 整合バリデーション` | createTestApp 化で移行可能 |
| `Accept-Language によるメッセージ切り替え` | エミュ固有のエラーメッセージ文字列を検証 |
| `defaultValue / defaultNowValue の自動補完` | 実機の defaultValue 動作を検証する価値あり → 移行候補 |
| `SUBTABLE 対応` / `SUBTABLE 行の追加 / 更新 / 削除（PUT マージ）` | 実機の SUBTABLE 行 id 採番が実機独自（数値連番）で、エミュの hex と不一致。テスト assertion の書き換え必要 |
| `SUBTABLE 内 NUMBER の正規化 / 非数値の扱い` | createTestApp 化で移行可能 |
| `top-level NUMBER の正規化` | createTestApp 化で移行可能 |
| `ルックアップ（LOOKUP）` / `ルックアップ: relatedKeyField が RECORD_NUMBER` | 2 つのアプリ + ルックアップ設定が必要。実機では addFormFields 後 deployApp、かつ relatedApp 指定が必要 |

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

**高**（実機互換性の確認価値が大きく、移行コストが低い）:
1. `record.test.ts` > `unique / maxLength / maxValue / options` バリデーション系
2. `record.test.ts` > `defaultValue / defaultNowValue`
3. `record.test.ts` > `SUBTABLE 内 NUMBER / top-level NUMBER 正規化`
4. `records.test.ts` > `アプリのレコード一覧のAPI`（`createTestApp` + recordIds 置換で可）

**中**:
5. `record.test.ts` > SUBTABLE CRUD 系（行 id の書き換え必要）
6. `record.test.ts` > ルックアップ（setup 2 アプリ + deploy）
7. `records.test.ts` > `一括 addRecords / updateRecords`（ID assertions の書き換え）

**低**（実機と乖離していて価値が低いか、エミュ専用機能の検証）:
- `auth.test.ts`（エミュ固有の /setup/auth.json）
- `app.test.ts`（/setup/app.json 由来の挙動）
- `form/layout/status.test.ts` 各種（revision / layout / status の setup 独自挙動）
- `clエラーレスポンス上限チェック`（/k/v1/preview/... raw fetch）
