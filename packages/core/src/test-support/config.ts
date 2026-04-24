// テストモードのランタイム設定を保持する。
// vitest に限らず任意のテストランナーで使えるよう、環境検出はしない。
// 消費側が `configureTestEnv(...)` を呼んで一度セットする。

export type RealKintoneTestEnv = {
  /** サブドメイン（https://<domain>.cybozu.com） */
  domain: string;
  /** ログインユーザー名 */
  user: string;
  /** パスワード */
  password: string;
  /** 事前に用意したテスト用アプリ ID プール（1 テスト内で必要な最大数を賄う個数） */
  appIds: number[];
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
