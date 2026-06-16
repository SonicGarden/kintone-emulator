// テストモードのランタイム設定を保持する。
// vitest に限らず任意のテストランナーで使えるよう、環境検出はしない。
// 消費側が `configureTestEnv(...)` を呼んで一度セットする。

/** `<spaceId>:<appId>` 形式で渡されるスペース所属アプリのエントリ */
export type SpaceAppEntry = { spaceId: number; appId: number };

export type RealKintoneTestEnv = {
  /** サブドメイン（https://<domain>.cybozu.com） */
  domain: string;
  /** ログインユーザー名 */
  user: string;
  /** パスワード */
  password: string;
  /** 事前に用意したテスト用アプリ ID プール（1 テスト内で必要な最大数を賄う個数） */
  appIds: number[];
  /** 通常スペース所属のテスト用アプリ。`spaceId:appId` 形式の配列 */
  spaceApps?: SpaceAppEntry[];
  /** ゲストスペース所属のテスト用アプリ。`spaceId:appId` 形式の配列 */
  guestSpaceApps?: SpaceAppEntry[];
};

export type TestEnv = {
  /**
   * `"real-kintone"` なら実 kintone モード、それ以外はエミュレーターモード。
   * vitest で使う場合は `import.meta.env.MODE` を渡すのが一般的。
   */
  mode: string;
  /**
   * エミュレーターモード時の baseUrl 解決に使うホスト。例: `"localhost:12345"`。
   * 未指定なら `process.env.TEST_PORT` を参照して `localhost:<port>` を生成し、
   * それも無ければ `localhost:12345` にフォールバック。
   */
  emulatorHost?: string;
  /**
   * 実 kintone モード時の接続情報。`mode === "real-kintone"` かつ実機に
   * アクセスする関数が呼ばれたときに参照される。
   */
  realKintone?: RealKintoneTestEnv;
};

let currentEnv: TestEnv = { mode: "test" };

/**
 * 一度だけ呼んでテスト環境のモードと接続情報を設定する。
 * setupFiles / globalSetup / beforeAll など、テスト実行前の任意の場所で呼べる。
 */
export const configureTestEnv = (env: Partial<TestEnv>): void => {
  currentEnv = { ...currentEnv, ...env };
};

/** 現在の設定を返す（読み取り専用想定） */
export const getTestEnv = (): TestEnv => currentEnv;

/** `mode === "real-kintone"` のとき true */
export const isUsingRealKintone = (): boolean => currentEnv.mode === "real-kintone";

// ============================================================
// env 文字列のパース（消費側が configureTestEnv に渡す前に使う）
// ============================================================

/**
 * `"12,13,14"` のようなカンマ区切りの数値列をパースして `number[]` に変換する。
 * 空・不正な値は除外される。
 */
export const parseAppIds = (raw: string | undefined): number[] =>
  (raw ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

/**
 * `"1:17,2:15,2:16"` のような `spaceId:appId` カンマ区切りをパースして
 * `SpaceAppEntry[]` に変換する。空・不正な値は除外される。
 */
export const parseSpaceApps = (raw: string | undefined): SpaceAppEntry[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry): SpaceAppEntry => {
      const [spaceId, appId] = entry.split(":").map(Number);
      return { spaceId: spaceId!, appId: appId! };
    })
    .filter((e) => Number.isFinite(e.spaceId) && e.spaceId > 0 && Number.isFinite(e.appId) && e.appId > 0);
