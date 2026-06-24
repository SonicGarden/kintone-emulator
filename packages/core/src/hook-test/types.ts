export type KintoneFieldValue = {
  type: string;
  value: unknown;
  [key: string]: unknown;
};

export type KintoneRecord = Record<string, KintoneFieldValue>;

export type KintoneEventObject = {
  type: string;
  appId: number;
  recordId?: number;
  record: KintoneRecord;
  error?: string;
  [key: string]: unknown;
};

export type KintoneEventHandler = (
  event: KintoneEventObject,
) => KintoneEventObject | false | Promise<KintoneEventObject | false>;

/** Node.js テスト用の最小限 DOM 要素スタブ */
export type KintoneElementStub = {
  readonly children: unknown[];
  appendChild(child: unknown): void;
  insertBefore(child: unknown, ref: unknown): void;
  removeChild(child: unknown): void;
  innerHTML: string;
  style: Record<string, string>;
  [key: string]: unknown;
};

/**
 * `kintone.api` の型定義。
 * 呼び出し可能かつ `.url()` メソッドを持つ。
 */
export type KintoneApiFunction = {
  (url: string, method: string, params?: Record<string, unknown>): Promise<unknown>;
  /** `/k/v1/records` → `/k/v1/records.json` */
  url(path: string, detectGuestSpace?: boolean): string;
};

export type KintoneStub = {
  events: {
    on(event: string | string[], handler: KintoneEventHandler): void;
    off(event: string | string[], handler?: KintoneEventHandler): void;
    /** テスト用: イベントを発火してハンドラーチェーンを実行する */
    fire(event: string, initial?: Partial<KintoneEventObject>): Promise<KintoneEventObject | false>;
    /** テスト用: 全ハンドラーをクリアする */
    clear(): void;
  };
  app: {
    record: {
      get(): { record: KintoneRecord };
      set(params: { record: Partial<KintoneRecord> }): void;
    };
    getId(): number | null;
    getRecordId(): number | null;
    /** 一覧画面の現在のクエリ文字列を返す */
    getQuery(): string;
    /** order by / limit / offset を除いたクエリ条件を返す */
    getQueryCondition(): string;
    /** 一覧画面ヘッダーメニュースペースの要素スタブを返す */
    getHeaderMenuSpaceElement(): KintoneElementStub;
    /** 一覧画面ヘッダースペースの要素スタブを返す */
    getHeaderSpaceElement(): KintoneElementStub;
  };
  api: KintoneApiFunction;
  /** テスト用: アプリIDを設定する */
  _setAppId(appId: number | null): void;
  /** テスト用: レコードIDを設定する */
  _setRecordId(recordId: number | null): void;
  /** テスト用: フォームのレコードデータを設定する */
  _setRecord(record: KintoneRecord): void;
  /** テスト用: kintone.app.getQuery() / getQueryCondition() が返すクエリを設定する */
  _setQuery(query: string): void;
};
