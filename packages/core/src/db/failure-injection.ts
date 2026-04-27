// セッション毎の障害注入状態。
// SQLite ではなくプロセスローカルの Map で管理する (テスト用の仕込みであり、永続化不要)。

export type FailureInjection = {
  nth: number;
  status: number;
  body: string | object;
  contentType: string;
  extraHeaders?: Record<string, string>;
  pathPattern?: string;
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
// 3. nth を 1 デクリメントし、0 になれば消費して返す。残っていれば undefined
export const consumeFailure = (
  session: string | undefined,
  pathname: string,
): FailureInjection | undefined => {
  const failure = store.get(sessionKey(session));
  if (!failure) return undefined;
  if (failure.pathPattern && !pathname.includes(failure.pathPattern)) return undefined;
  failure.nth -= 1;
  if (failure.nth > 0) return undefined;
  store.delete(sessionKey(session));
  return failure;
};
