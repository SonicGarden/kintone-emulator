type KintoneFieldCell = { type?: string; value: unknown };
type KintoneRecord = Record<string, KintoneFieldCell | undefined>;

interface KintoneEvent {
  type: string;
  appId?: number;
  recordId?: number;
  record?: KintoneRecord;
  records?: KintoneRecord[];
  changes?: { field?: { type: string; value: unknown } };
  url?: string;
  [key: string]: unknown;
}

type KintoneEventHandler = (event: KintoneEvent) => KintoneEvent | Promise<KintoneEvent> | void | Promise<void>;

interface Window {
  kintone?: {
    events: {
      on(types: string | string[], handler: KintoneEventHandler): void;
      off(types: string | string[], handler?: KintoneEventHandler): void;
      fire(type: string, event: KintoneEvent): Promise<KintoneEvent>;
    };
    app: {
      getId(): number | null;
      record: {
        get(): KintoneRecord | null;
        set(record: KintoneRecord): void;
      };
    };
  };
  __kintoneAppId?: number;
  __kintoneRecord?: KintoneRecord;
}
