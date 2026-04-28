// デュアルモードテスト層。テストランナーを問わず使える。
//
// - emulator モード: helpers.ts のエミュレーター向け HTTP プリミティブに委譲
// - real モード（`mode === "real-kintone"`）: 事前に用意した appIds プールを
//   順番に割り当て、レコード全削除 → (フィールド定義が変わっていれば)
//   フィールド全削除 + 追加 + deploy → レコード一括追加、の流れで状態をリセット
//
// 設定は `configureTestEnv({ mode, realKintone: { domain, user, password, appIds } })` で注入。
// vitest であれば `import.meta.env.MODE` / `import.meta.env.VITE_*` を渡すのが一般的。

import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { getTestEnv, isUsingRealKintone } from "./config";
import {
  createApp as emulatorCreateApp,
  createBaseUrl as emulatorCreateBaseUrl,
  finalizeSession as emulatorFinalizeSession,
  initializeSession as emulatorInitializeSession,
  setupAuth as emulatorSetupAuth,
  setupSpace as emulatorSetupSpace,
} from "./helpers";

// ============================================================
// 実 kintone 設定の取り出し
// ============================================================

const getRealKintoneConfig = () => {
  const { realKintone } = getTestEnv();
  if (!realKintone || !realKintone.domain || !realKintone.user || !realKintone.password) {
    throw new Error(
      "configureTestEnv({ realKintone: { domain, user, password, appIds } }) を real-kintone モードで呼ぶ前に設定してください",
    );
  }
  return realKintone;
};

const getRealKintoneAppIds = (): number[] => {
  const ids = getRealKintoneConfig().appIds;
  if (!ids || ids.length === 0) {
    throw new Error(
      "configureTestEnv({ realKintone: { appIds } }) が空です。テスト用アプリ ID のプールを指定してください",
    );
  }
  return ids;
};

// 各テストで createTestApp 呼び出しごとに appIds から順番に割り当てる。
// resetAppAssignment() で先頭に戻す（setup の beforeEach から呼ぶ想定）。
let nextRealAppIndex = 0;

const nextRealAppId = (): number => {
  const ids = getRealKintoneAppIds();
  if (nextRealAppIndex >= ids.length) {
    throw new Error(
      `realKintone.appIds には ${ids.length} 個のアプリ ID しか指定されていません。` +
      "1 つのテスト内で必要なアプリ数を確保するため、appIds の個数を増やしてください。",
    );
  }
  const id = ids[nextRealAppIndex]!;
  nextRealAppIndex += 1;
  return id;
};

export const resetAppAssignment = (): void => {
  nextRealAppIndex = 0;
};

const realKintoneClientCache = new Map<string, KintoneRestAPIClient>();
const getRealKintoneClient = (guestSpaceId?: number): KintoneRestAPIClient => {
  const key = guestSpaceId == null ? "default" : `guest:${guestSpaceId}`;
  const cached = realKintoneClientCache.get(key);
  if (cached) return cached;
  const cfg = getRealKintoneConfig();
  const client = new KintoneRestAPIClient({
    baseUrl: `https://${cfg.domain}.cybozu.com`,
    auth: { username: cfg.user, password: cfg.password },
    ...(guestSpaceId != null ? { guestSpaceId } : {}),
  });
  realKintoneClientCache.set(key, client);
  return client;
};

// ============================================================
// 公開 API: URL / auth / client
// ============================================================

export const getTestBaseUrl = (session: string): string => {
  if (isUsingRealKintone()) {
    return `https://${getRealKintoneConfig().domain}.cybozu.com`;
  }
  return emulatorCreateBaseUrl(session);
};

export const getTestAuth = ():
  | { apiToken: string }
  | { username: string; password: string } => {
  if (isUsingRealKintone()) {
    const cfg = getRealKintoneConfig();
    return { username: cfg.user, password: cfg.password };
  }
  return { apiToken: "test" };
};

export const getTestClient = (session: string): KintoneRestAPIClient =>
  new KintoneRestAPIClient({ baseUrl: getTestBaseUrl(session), auth: getTestAuth() });

/**
 * 通常スペース所属のテスト用アプリ一覧を返す。
 * - real: configureTestEnv で渡された spaceApps
 * - emulator: undefined（呼び出し側で testEmulatorOnly / setupSpace を組み合わせる前提）
 */
export const getTestSpaceApps = () => getTestEnv().realKintone?.spaceApps ?? [];

/** ゲストスペース所属のテスト用アプリ一覧を返す。 */
export const getTestGuestSpaceApps = () => getTestEnv().realKintone?.guestSpaceApps ?? [];

/**
 * raw fetch 用の認証ヘッダー。SDK を経由せずに必須パラメーター欠落などの
 * バリデーションをテストする際に使う。
 * - real: X-Cybozu-Authorization (basic)
 * - emulator: 認証未設定の場合は空（auth handler が素通し）
 */
export const getTestRequestHeaders = (): Record<string, string> => {
  if (!isUsingRealKintone()) return {};
  const cfg = getRealKintoneConfig();
  return {
    "X-Cybozu-Authorization": Buffer.from(`${cfg.user}:${cfg.password}`).toString("base64"),
  };
};

// ============================================================
// 公開 API: テスト環境リセット
// ============================================================

/**
 * テスト前の環境リセット。
 * - emulator: finalize + initialize でセッション丸ごとリセット
 * - real: アプリ ID 割り当てインデックスをリセット（実アプリのデータは createTestApp 時に削除）
 */
export const resetTestEnvironment = async (session: string): Promise<void> => {
  resetAppAssignment();
  clearEmulatorDynamicSpaceCache(session);
  if (isUsingRealKintone()) return;
  const url = emulatorCreateBaseUrl(session);
  await emulatorFinalizeSession(url);
  await emulatorInitializeSession(url);
};

/** 認証系テスト用。real モードでは no-op（describeEmulatorOnly でラップする想定） */
export const setupTestAuth = async (
  session: string,
  username: string,
  password: string,
): Promise<void> => {
  if (isUsingRealKintone()) return;
  await emulatorSetupAuth(emulatorCreateBaseUrl(session), username, password);
};

// ============================================================
// 公開 API: createTestApp
// ============================================================

export type CreateTestAppParams = {
  id?: number;
  name: string;
  properties?: Record<string, unknown>;
  layout?: unknown[];
  status?: unknown;
  records?: unknown[];
};

export type CreateTestAppResult = { appId: number; recordIds: number[] };

export const createTestApp = async (
  session: string,
  params: CreateTestAppParams,
): Promise<CreateTestAppResult> => {
  if (!isUsingRealKintone()) {
    return emulatorCreateApp(emulatorCreateBaseUrl(session), params);
  }
  return setupRealKintoneApp(params);
};

// ============================================================
// 公開 API: createTestSpaceApp
// ============================================================

export type SpaceKind = "space" | "guestSpace";

export type CreateTestSpaceAppParams = {
  /** 通常スペース所属なら "space"、ゲストスペース所属なら "guestSpace" */
  kind: SpaceKind;
  /**
   * 何番目のスペースを使うか（spaceId のユニーク順、デフォルト 0）。
   * env `2:15,2:16,4:20` の場合、spaceIndex=0→space 2、spaceIndex=1→space 4
   */
  spaceIndex?: number;
  /**
   * 同一スペース内の何番目のアプリを使うか（spaceIndex で選んだ space 内の登場順、デフォルト 0）。
   * env `2:15,2:16` の場合、spaceIndex=0/appIndex=0→app 15、spaceIndex=0/appIndex=1→app 16
   */
  appIndex?: number;
  /** emulator モードでのみ参照される。real モードでは既存アプリ名を変更しない */
  name?: string;
  properties?: Record<string, unknown>;
  layout?: unknown[];
  status?: unknown;
  records?: unknown[];
};

/** spaceId 順に space/app をグルーピングして spaceIndex/appIndex で引けるようにする */
const groupBySpace = (entries: { spaceId: number; appId: number }[]) => {
  const seen = new Map<number, number[]>();
  for (const e of entries) {
    if (!seen.has(e.spaceId)) seen.set(e.spaceId, []);
    seen.get(e.spaceId)!.push(e.appId);
  }
  return [...seen.entries()].map(([spaceId, appIds]) => ({ spaceId, appIds }));
};

export type CreateTestSpaceAppResult = {
  appId: number;
  spaceId: number;
  recordIds: number[];
};

// emulator かつ env 未指定のとき、spaceIndex → 動的割当した spaceId を覚えておく。
// 同一テスト内で「同じ spaceIndex なら同じ space」を保証するため。
// resetTestEnvironment でセッション単位にクリアされる。
const emulatorDynamicSpaceCache = new Map<string, number>(); // key=`${session}:${kind}:${spaceIndex}` → spaceId

const clearEmulatorDynamicSpaceCache = (session: string): void => {
  for (const key of [...emulatorDynamicSpaceCache.keys()]) {
    if (key.startsWith(`${session}:`)) emulatorDynamicSpaceCache.delete(key);
  }
};

/**
 * スペース所属（通常 or ゲスト）のテスト用アプリを準備する。
 * - emulator: env があれば指定 ID で setup、無ければ DB の auto-assign に任せる。
 *   同一 session 内で同じ spaceIndex を指定すれば同じスペースが再利用される
 * - real: env で指定された appId を使ってレコード/フィールドを setup する
 */
export const createTestSpaceApp = async (
  session: string,
  params: CreateTestSpaceAppParams,
): Promise<CreateTestSpaceAppResult> => {
  const spaceIndex = params.spaceIndex ?? 0;
  const appIndex = params.appIndex ?? 0;
  const grouped = groupBySpace(
    params.kind === "guestSpace" ? getTestGuestSpaceApps() : getTestSpaceApps(),
  );
  const space = grouped[spaceIndex];
  const envFixture = space && space.appIds[appIndex] != null
    ? { spaceId: space.spaceId, appId: space.appIds[appIndex]! }
    : undefined;

  if (isUsingRealKintone() && !envFixture) {
    const envName = params.kind === "guestSpace"
      ? "VITE_KINTONE_TEST_GUEST_SPACE_APP_IDS"
      : "VITE_KINTONE_TEST_SPACE_APP_IDS";
    throw new Error(
      `${envName} に spaceIndex=${spaceIndex} / appIndex=${appIndex} に対応するエントリがありません`,
    );
  }

  const appParams: CreateTestAppParams = {
    name: params.name ?? `${params.kind} app`,
    properties: params.properties,
    layout: params.layout,
    status: params.status,
    records: params.records,
  };

  if (!isUsingRealKintone()) {
    const url = emulatorCreateBaseUrl(session);
    let spaceId: number;
    let appIdToCreate: number | undefined;

    if (envFixture) {
      spaceId = envFixture.spaceId;
      appIdToCreate = envFixture.appId;
      await emulatorSetupSpace(url, { id: spaceId, isGuest: params.kind === "guestSpace" });
    } else {
      // 動的割当: spaceIndex キーで space を再利用、app は毎回新規
      const cacheKey = `${session}:${params.kind}:${spaceIndex}`;
      const cached = emulatorDynamicSpaceCache.get(cacheKey);
      if (cached != null) {
        spaceId = cached;
      } else {
        const r = await emulatorSetupSpace(url, { isGuest: params.kind === "guestSpace" });
        spaceId = r.id;
        emulatorDynamicSpaceCache.set(cacheKey, spaceId);
      }
    }

    const result = await emulatorCreateApp(url, {
      ...appParams,
      id: appIdToCreate,
      spaceId,
      threadId: spaceId,
    });
    return { appId: result.appId, spaceId, recordIds: result.recordIds };
  }

  const result = await setupRealKintoneAppWithId(
    envFixture!.appId,
    appParams,
    params.kind === "guestSpace" ? envFixture!.spaceId : undefined,
  );
  return { appId: result.appId, spaceId: envFixture!.spaceId, recordIds: result.recordIds };
};

// ============================================================
// 実 kintone 側のセットアップロジック
// ============================================================

// 削除できないシステムフィールドのタイプ
const SYSTEM_FIELD_TYPES = new Set([
  "RECORD_NUMBER",
  "CREATOR",
  "MODIFIER",
  "CREATED_TIME",
  "UPDATED_TIME",
  "STATUS",
  "STATUS_ASSIGNEE",
  "CATEGORY",
  "__ID__",
  "__REVISION__",
]);

// レコード追加時に値を設定できないフィールドタイプ
const RECORD_SYSTEM_FIELD_TYPES = new Set([
  ...SYSTEM_FIELD_TYPES,
  "CALC",
]);

// アプリごとの「前回セットアップしたフィールド定義のハッシュ」
// ハッシュが変わっていない場合は deploy をスキップできる
const lastSetupFieldsHashByAppId = new Map<number, string>();

/** オブジェクトのキーを再帰的にソートして決定的な JSON 表現を得るためのヘルパー */
const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
};

const setupRealKintoneApp = async (
  params: CreateTestAppParams,
): Promise<CreateTestAppResult> => setupRealKintoneAppWithId(nextRealAppId(), params);

const setupRealKintoneAppWithId = async (
  appId: number,
  params: CreateTestAppParams,
  guestSpaceId?: number,
): Promise<CreateTestAppResult> => {
  const client = getRealKintoneClient(guestSpaceId);

  // 1. レコード全削除
  await deleteAllRecords(client, appId);

  // 2. フィールド定義が前回と完全一致する場合は skip
  if (params.properties) {
    const fieldsToAdd = filterAddableFields(params.properties);
    // ネストまで含めてキーをソートして文字列化することで、キー順の揺れと
    // 階層を超えたハッシュ衝突を両方避ける
    const fieldsHash = JSON.stringify(sortKeysDeep(fieldsToAdd));
    if (fieldsHash !== lastSetupFieldsHashByAppId.get(appId)) {
      await deleteAllFields(client, appId);
      if (Object.keys(fieldsToAdd).length > 0) {
        await client.app.addFormFields({ app: appId, properties: fieldsToAdd as never });
      }
      await deployApp(client, appId);
      lastSetupFieldsHashByAppId.set(appId, fieldsHash);
    }
  }

  // 3. レコード一括追加（実 kintone では $id / システムフィールド / FILE は設定不可）
  const recordIds: number[] = [];
  const recordsToAdd = (params.records ?? []).map(stripUnsupportedRecordFields);
  if (recordsToAdd.length > 0) {
    const resp = await client.record.addRecords({ app: appId, records: recordsToAdd as never });
    recordIds.push(...resp.ids.map(Number));
  }

  return { appId, recordIds };
};

const deleteAllRecords = async (client: KintoneRestAPIClient, appId: number): Promise<void> => {
  const allIds: number[] = [];
  let offset = 0;
  const limit = 500;
  // 上限まで繰り返しで全 ID を収集
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { records } = await client.record.getRecords({
      app: appId,
      query: `order by $id asc limit ${limit} offset ${offset}`,
      fields: ["$id"],
    });
    if (records.length === 0) break;
    for (const r of records) {
      const id = (r as unknown as { $id: { value: string } }).$id.value;
      allIds.push(Number(id));
    }
    offset += limit;
  }
  for (let i = 0; i < allIds.length; i += 100) {
    await client.record.deleteRecords({ app: appId, ids: allIds.slice(i, i + 100) });
  }
};

const deleteAllFields = async (client: KintoneRestAPIClient, appId: number): Promise<void> => {
  // preview: true でプレビュー側のフィールド一覧を取得する。
  // getFormFields のデフォルト（live）だと、ライブにのみ存在する（プレビューから消えた）フィールドを
  // 削除対象に含めてしまい、deleteFormFields（プレビュー対象）が GAIA_FC01 で失敗する。
  const { properties } = await client.app.getFormFields({ app: appId, preview: true });
  const fieldCodes = Object.entries(properties)
    .filter(([, field]) => !SYSTEM_FIELD_TYPES.has((field as { type: string }).type))
    .map(([code]) => code);
  if (fieldCodes.length === 0) return;
  try {
    await client.app.deleteFormFields({ app: appId, fields: fieldCodes });
  } catch (e) {
    // GAIA_LO02: このフィールドが他アプリのルックアップから参照されている場合。
    // 他のプール app のフィールドを先にすべてクリアしてから再試行する
    // （前のテストブロックが残したルックアップ参照を解く）
    if ((e as { code?: string }).code !== "GAIA_LO02") throw e;
    await clearOtherPoolApps(client, appId);
    await client.app.deleteFormFields({ app: appId, fields: fieldCodes });
  }
};

/** 指定 appId 以外のプール app をすべて空にする（ルックアップ参照を解除するため） */
const clearOtherPoolApps = async (client: KintoneRestAPIClient, exceptAppId: number): Promise<void> => {
  const ids = getRealKintoneAppIds().filter((id) => id !== exceptAppId);
  for (const otherId of ids) {
    const { properties } = await client.app.getFormFields({ app: otherId, preview: true });
    const codes = Object.entries(properties)
      .filter(([, field]) => !SYSTEM_FIELD_TYPES.has((field as { type: string }).type))
      .map(([code]) => code);
    if (codes.length > 0) {
      await client.app.deleteFormFields({ app: otherId, fields: codes });
      await deployApp(client, otherId);
    }
    lastSetupFieldsHashByAppId.delete(otherId);
  }
};

const deployApp = async (client: KintoneRestAPIClient, appId: number): Promise<void> => {
  await client.app.deployApp({ apps: [{ app: appId }] });
  // 30 回 × 500ms = 最大 15 秒待機
  for (let i = 0; i < 30; i++) {
    const { apps } = await client.app.getDeployStatus({ apps: [appId] });
    const status = apps[0]?.status;
    if (status === "SUCCESS") return;
    if (status === "FAIL") throw new Error(`Deploy failed for app ${appId}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Deploy timed out for app ${appId}`);
};

/** 実 kintone の addFormFields に渡せないフィールドを除外 */
const filterAddableFields = (
  properties: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [code, field] of Object.entries(properties)) {
    const f = field as { type: string; fields?: Record<string, unknown>; lookup?: unknown };
    if (SYSTEM_FIELD_TYPES.has(f.type)) continue;
    if (f.type === "REFERENCE_TABLE") continue;
    result[code] = field;
  }
  return result;
};

/** レコード値のうち実 kintone で設定不可なものを除外 */
const stripUnsupportedRecordFields = (
  record: unknown,
): Record<string, unknown> => {
  const src = record as Record<string, { type?: string; value?: unknown }>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === "$id" || key === "$revision") continue;
    const type = value?.type;
    if (type && RECORD_SYSTEM_FIELD_TYPES.has(type)) continue;
    // 実 kintone に存在しない fileKey を指定するとエラーになるため FILE は空配列に
    if (type === "FILE") {
      out[key] = { type: "FILE", value: [] };
      continue;
    }
    // SUBTABLE 内 FILE も同様に空配列化
    if (type === "SUBTABLE" && Array.isArray(value.value)) {
      out[key] = {
        type: "SUBTABLE",
        value: (value.value as Array<{ id?: string; value: Record<string, { type?: string; value?: unknown }> }>).map((row) => ({
          ...row,
          value: Object.fromEntries(
            Object.entries(row.value).map(([k, v]) =>
              v?.type === "FILE" ? [k, { type: "FILE", value: [] }] : [k, v],
            ),
          ),
        })),
      };
      continue;
    }
    out[key] = value;
  }
  return out;
};
