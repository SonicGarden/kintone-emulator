// セッション毎の障害注入状態。
// SQLite ではなくプロセスローカルの Map で管理する (テスト用の仕込みであり、永続化不要)。

export type FailureInjection = {
  nth: number;
  status: number;
  body: string | object;
  contentType: string;
  extraHeaders?: Record<string, string>;
  pathPattern?: string;
  // true なら nth 到達後も残り続け、解除されるまで全マッチリクエストで発火し続ける
  persistent?: boolean;
};

const sessionKey = (session: string | undefined): string => session ?? "<default>";

const store = new Map<string, FailureInjection>();

export const setFailure = (
  session: string | undefined,
  failure: FailureInjection,
): void => {
  store.set(sessionKey(session), failure);
};

export const clearFailure = (session: string | undefined): void => {
  store.delete(sessionKey(session));
};

export const getFailure = (session: string | undefined): FailureInjection | undefined =>
  store.get(sessionKey(session));

// ハンドラー側で消費するためのヘルパー。
// 1. 登録が無ければ undefined
// 2. pathPattern が指定されていてマッチしないなら undefined (カウンタは触らない)
// 3. nth まで到達していなければ 1 デクリメントして undefined
// 4. nth に到達したら発火。persistent でなければクリア、persistent なら nth=0 のまま残し続ける
export const consumeFailure = (
  session: string | undefined,
  pathname: string,
): FailureInjection | undefined => {
  const failure = store.get(sessionKey(session));
  if (!failure) return undefined;
  if (failure.pathPattern && !pathname.includes(failure.pathPattern)) return undefined;
  if (failure.nth > 1) {
    failure.nth -= 1;
    return undefined;
  }
  if (failure.persistent) {
    failure.nth = 0;
  } else {
    store.delete(sessionKey(session));
  }
  return failure;
};
