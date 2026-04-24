// デュアルモードテスト層。`USE_REAL_KINTONE=1` でテストを実 kintone に対して実行する。
//
// - emulator モード: 既存の `tests/helpers.ts` プリミティブに委譲する
// - real モード: 事前に用意した `KINTONE_TEST_APP_IDS` のアプリ群を順番に割り当て、
//   レコード全削除 → (フィールド定義が変わっていれば) フィールド全削除 + 追加 + deploy
//   → レコード一括追加、という流れでテスト前の状態を揃える。
//   フィールド定義のハッシュキャッシュで deploy 回数を最小化する。

import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { describe, test } from "vitest";
import {
  createApp as emulatorCreateApp,
  createBaseUrl as emulatorCreateBaseUrl,
  finalizeSession as emulatorFinalizeSession,
  initializeSession as emulatorInitializeSession,
  setupAuth as emulatorSetupAuth,
} from "./helpers";

// ============================================================
// モード判定
// ============================================================

export const isUsingRealKintone = (): boolean => process.env.USE_REAL_KINTONE === "1";

// ============================================================
// 実 kintone 設定
// ============================================================

type RealKintoneConfig = { domain: string; username: string; password: string };

const getRealKintoneConfig = (): RealKintoneConfig => {
  const domain = process.env.KINTONE_TEST_DOMAIN;
  const username = process.env.KINTONE_TEST_USER;
  const password = process.env.KINTONE_TEST_PASSWORD;
  if (!domain || !username || !password) {
    throw new Error(
      "KINTONE_TEST_DOMAIN, KINTONE_TEST_USER, KINTONE_TEST_PASSWORD are required when USE_REAL_KINTONE=1",
    );
  }
  return { domain, username, password };
};

const getRealKintoneAppIds = (): number[] => {
  const raw = process.env.KINTONE_TEST_APP_IDS;
  if (!raw) {
    throw new Error("KINTONE_TEST_APP_IDS is required when USE_REAL_KINTONE=1");
  }
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
};

// 各テストで createTestApp 呼び出しごとに KINTONE_TEST_APP_IDS から順番に割り当てる。
// resetAppAssignment() で先頭に戻す（setup.ts の beforeEach から呼ぶ）。
let nextRealAppIndex = 0;

const nextRealAppId = (): number => {
  const ids = getRealKintoneAppIds();
  if (nextRealAppIndex >= ids.length) {
    throw new Error(
      `KINTONE_TEST_APP_IDS には ${ids.length} 個のアプリ ID しか指定されていません。` +
        `1 つのテスト内で必要なアプリ数を確保するため、KINTONE_TEST_APP_IDS の個数を増やしてください。`,
    );
  }
  const id = ids[nextRealAppIndex]!;
  nextRealAppIndex += 1;
  return id;
};

export const resetAppAssignment = (): void => {
  nextRealAppIndex = 0;
};

let realKintoneClient: KintoneRestAPIClient | null = null;
const getRealKintoneClient = (): KintoneRestAPIClient => {
  if (realKintoneClient) return realKintoneClient;
  const cfg = getRealKintoneConfig();
  realKintoneClient = new KintoneRestAPIClient({
    baseUrl: `https://${cfg.domain}.cybozu.com`,
    auth: { username: cfg.username, password: cfg.password },
  });
  return realKintoneClient;
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
    return { username: cfg.username, password: cfg.password };
  }
  return { apiToken: "test" };
};

export const getTestClient = (session: string): KintoneRestAPIClient =>
  new KintoneRestAPIClient({ baseUrl: getTestBaseUrl(session), auth: getTestAuth() });

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
    const appId = await emulatorCreateApp(emulatorCreateBaseUrl(session), params);
    // emulator の createApp は app だけ返すが、real との整合のため records の件数分ダミーは返さない。
    // emulator の recordIds を使いたい場合は直接 /setup/app.json を呼ぶ。
    return { appId, recordIds: [] };
  }
  return setupRealKintoneApp(params);
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

const setupRealKintoneApp = async (
  params: CreateTestAppParams,
): Promise<CreateTestAppResult> => {
  const appId = nextRealAppId();
  const client = getRealKintoneClient();

  // 1. レコード全削除
  await deleteAllRecords(client, appId);

  // 2. フィールド定義が前回と完全一致する場合は skip
  if (params.properties) {
    const fieldsToAdd = filterAddableFields(params.properties);
    const fieldsHash = JSON.stringify(fieldsToAdd, Object.keys(fieldsToAdd).sort());
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
    // ルックアップを含む SUBTABLE は、内部のルックアップだけ除外してから渡す
    if (f.type === "SUBTABLE" && f.fields) {
      const filteredFields: Record<string, unknown> = {};
      for (const [subCode, subField] of Object.entries(f.fields)) {
        if (!(subField as { lookup?: unknown }).lookup) filteredFields[subCode] = subField;
      }
      result[code] = { ...f, fields: filteredFields };
      continue;
    }
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

// ============================================================
// 公開 API: describe ラッパー
// ============================================================

/** 両モードで実行される describe。将来的に real モードでのログ出力等を足す余地 */
export const describeDualMode = describe;

/**
 * エミュレーターでのみ実行する describe。
 * 実 kintone モード時は `describe.skip` となる。
 * （例: /setup/auth.json を叩く認証テスト、エミュレーター固有のエラー id を検証するテスト）
 */
export const describeEmulatorOnly: typeof describe = ((name: string, fn: () => void) => {
  if (isUsingRealKintone()) return describe.skip(name, fn);
  return describe(name, fn);
}) as typeof describe;

/** エミュレーターでのみ実行する test。実 kintone モード時は skip */
export const testEmulatorOnly: typeof test = ((name: string, fn: () => void | Promise<void>) => {
  if (isUsingRealKintone()) return test.skip(name, fn);
  return test(name, fn);
}) as typeof test;
