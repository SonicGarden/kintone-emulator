import type {
  KintoneApiFunction,
  KintoneElementStub,
  KintoneEventHandler,
  KintoneEventObject,
  KintoneRecord,
  KintoneStub,
} from "./types";

const createElementStub = (): KintoneElementStub => {
  const children: unknown[] = [];
  return {
    get children() {
      return children;
    },
    appendChild(child: unknown) {
      children.push(child);
    },
    insertBefore(child: unknown, ref: unknown) {
      const idx = children.indexOf(ref);
      if (idx >= 0) children.splice(idx, 0, child);
      else children.push(child);
    },
    removeChild(child: unknown) {
      const idx = children.indexOf(child);
      if (idx >= 0) children.splice(idx, 1);
    },
    innerHTML: "",
    style: {},
  };
};

export const createKintoneStub = (options?: {
  baseUrl?: string;
  appId?: number;
}): KintoneStub => {
  const handlerMap = new Map<string, KintoneEventHandler[]>();
  let record: KintoneRecord = {};
  let appId: number | null = options?.appId ?? null;
  let recordId: number | null = null;
  let query = "";

  // kintone.app.getHeaderMenuSpaceElement() / getHeaderSpaceElement() は
  // 一覧画面で毎回同じ要素を返す想定（テストで appendChild を検証できる）
  const headerMenuSpaceElement = createElementStub();
  const headerSpaceElement = createElementStub();

  const apiFn = Object.assign(
    async (url: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
      if (!options?.baseUrl) {
        throw new Error(
          "kintone.api() が呼ばれましたが createKintoneStub() に baseUrl が渡されていません。" +
            "REST API を使うカスタマイズのテストには createKintoneStub({ baseUrl }) を使ってください。",
        );
      }
      const upperMethod = method.toUpperCase();
      let fetchUrl = `${options.baseUrl}${url}`;
      let body: string | undefined;

      if (upperMethod === "GET" || upperMethod === "DELETE") {
        const qs = new URLSearchParams(
          Object.entries(params).flatMap(([k, v]) => {
            if (Array.isArray(v)) return v.map((item) => [k, String(item)]);
            if (typeof v === "object" && v !== null) return [[k, JSON.stringify(v)]];
            return [[k, String(v)]];
          }),
        ).toString();
        if (qs) fetchUrl += `?${qs}`;
      } else {
        body = JSON.stringify(params);
      }

      const response = await fetch(fetchUrl, {
        method: upperMethod,
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw Object.assign(
          new Error((error as { message?: string }).message ?? response.statusText),
          error,
        );
      }
      return response.json();
    },
    {
      url: (path: string, _detectGuestSpace?: boolean): string => `${path}.json`,
    },
  ) as KintoneApiFunction;

  return {
    events: {
      on(eventName, handler) {
        const names = Array.isArray(eventName) ? eventName : [eventName];
        for (const name of names) {
          if (!handlerMap.has(name)) handlerMap.set(name, []);
          handlerMap.get(name)!.push(handler);
        }
      },
      off(eventName, handler) {
        const names = Array.isArray(eventName) ? eventName : [eventName];
        for (const name of names) {
          if (handler === undefined) {
            handlerMap.delete(name);
          } else {
            const existing = handlerMap.get(name);
            if (existing) handlerMap.set(name, existing.filter((h) => h !== handler));
          }
        }
      },
      async fire(event, initial) {
        let eventObj: KintoneEventObject = {
          type: event,
          appId: appId ?? 0,
          record: Object.assign({}, record) as KintoneRecord,
          ...initial,
        };
        if (recordId !== null && !("recordId" in eventObj)) {
          eventObj.recordId = recordId;
        }

        const handlers = handlerMap.get(event) ?? [];
        for (const handler of handlers) {
          const result = await handler(eventObj);
          if (result === false) return false;
          if (result == null) {
            throw new Error(
              `"${event}" イベントのハンドラーが undefined を返しました。` +
                "イベントオブジェクトを必ず return してください。",
            );
          }
          eventObj = result;
          if (eventObj.error) break;
        }
        return eventObj;
      },
      clear() {
        handlerMap.clear();
      },
    },
    app: {
      record: {
        get: () => ({ record: Object.assign({}, record) as KintoneRecord }),
        set: (params) => {
          record = Object.assign({}, record, params.record) as KintoneRecord;
        },
      },
      getId: () => appId,
      getRecordId: () => recordId,
      getQuery: () => query,
      getQueryCondition: () =>
        query
          .replace(/\s*order\s+by\s+.+$/i, "")
          .replace(/\s*limit\s+\d+/gi, "")
          .replace(/\s*offset\s+\d+/gi, "")
          .trim(),
      getHeaderMenuSpaceElement: () => headerMenuSpaceElement,
      getHeaderSpaceElement: () => headerSpaceElement,
    },
    api: apiFn,
    _setAppId: (id) => {
      appId = id;
    },
    _setRecordId: (id) => {
      recordId = id;
    },
    _setRecord: (r) => {
      record = r;
    },
    _setQuery: (q) => {
      query = q;
    },
  };
};
