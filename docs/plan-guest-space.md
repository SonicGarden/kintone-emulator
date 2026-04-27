# ゲストスペース機能 実装計画

> 進捗管理用。各タスクのチェックボックスを実装の進行に合わせて更新する。

## 背景: 再現すべき本物 kintone の挙動

| ケース | 非ゲストパス `/k/v1/app.json` | ゲストパス `/k/guest/{N}/v1/app.json` |
|---|---|---|
| 通常スペースのアプリ | 200 | エラー |
| ゲストスペースのアプリ | 520 / `GAIA_IL23` | spaceId 一致時のみ 200 |
| getApps | spaceId 付きで返る（パス問わず） | 同左（ゲストスペース内のアプリのみ） |

ユーザー側の判定ロジック（getApps→spaceId 抽出→ guestSpaceId 指定で getApp が成功すればゲスト）が動くには、**「非ゲストパスの getApp はゲストスペース app で失敗」「ゲストパスの getApp は通常 space app で失敗」**の両方が必須。

## 実装フェーズ

### Phase 1: データモデルとセットアップ
- [x] `spaces` テーブル新設（`id`, `is_guest`, `name`）
- [x] `apps` テーブルに `space_id` / `thread_id` 列追加
- [x] `db/spaces.ts` 新設（`findSpace`, `insertSpace`）
- [x] `db/apps.ts` の `AppRow` / `insertApp` を `space_id`, `thread_id` 対応に拡張
- [x] `setup/space.json` エンドポイント新設（`POST` で space を登録）
- [x] `setup/app.json` で `spaceId` / `threadId` を受け付け
- [x] `getApps` レスポンスの `spaceId` / `threadId` を実値で返す
- [x] テスト: getApps が spaceId を返す / setup/space が動作

### Phase 2: ゲストパスのルーティングと getApp ガード
- [x] `HandlerArgs.params.guestSpaceId?: string` を追加
- [x] `errors.ts` に `errorGuestSpacePathRequired`（`GAIA_IL23`, HTTP 520）追加
- [x] `handlers/app.ts` (getApp) にゲストスペース判定ロジックを追加
  - 非ゲストパス × ゲスト app → `GAIA_IL23`
  - ゲストパス × 非ゲスト app または spaceId 不一致 → エラー
- [x] `handlers/apps.ts` (getApps) ゲストパス指定時に該当 guest space のアプリのみ返す
- [x] Remix ルート追加（`($session).k.guest.$guestSpaceId.v1.app[.]json.tsx`, `apps[.]json.tsx`）
- [x] インプロセスサーバー（`src/server.ts`）にもゲストパス + setup/space.json を追加
- [x] テスト: ユーザー判定ロジックの再現テスト（getApps→guest 指定 getApp）

### Phase 3: その他エンドポイントへの波及
- [x] 共通ガード `handlers/guest-space.ts` (`enforceGuestSpace`)
- [x] record / records / fields / layout / status / preview-fields / comment / comments の各メソッドに組み込み
- [x] `server.ts` のルートを `/k(?:/guest/{N})?/v1/...` パターンに統合
- [x] Remix ルート `($session).k.guest.$guestSpaceId.v1.*` を全エンドポイント分追加
- [x] テスト: ゲスト app の records / form fields を非ゲストパスで叩くと GAIA_IL23、ゲストパスでは成功

## 実装上のメモ

- ルート定義は薄いラッパーで、既存ハンドラーへ `params.guestSpaceId` を渡すだけにする
- `apps` テーブルの列追加のみで、既存挙動は `space_id IS NULL` のため不変
- `getApps` の `spaceId` を `null` 固定→実値に変える（後方互換あり）
