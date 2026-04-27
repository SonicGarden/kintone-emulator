// セッション毎の障害注入状態。
// SQLite ではなくプロセスローカルの Map で管理する (テスト用の仕込みであり、永続化不要)。

export type FailureInjection = {
  // 何回スキップした後に発火するか。0 なら次のリクエストから発火
  skip: number;
  // 何回発火するか。undefined なら解除されるまで永続発火 (メンテナンス再現)
  count?: number;
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
// 3. skip > 0 なら 1 デクリメントして undefined (まだ発火フェーズではない)
// 4. 発火フェーズ。count が未指定なら永続発火 (状態は残す)、count があれば 1 デクリメントし、
//    0 になればクリアする
export const consumeFailure = (
  session: string | undefined,
  pathname: string,
): FailureInjection | undefined => {
  const failure = store.get(sessionKey(session));
  if (!failure) return undefined;
  if (failure.pathPattern && !pathname.includes(failure.pathPattern)) return undefined;
  if (failure.skip > 0) {
    failure.skip -= 1;
    return undefined;
  }
  if (failure.count === undefined) return failure;
  if (failure.count <= 1) {
    store.delete(sessionKey(session));
  } else {
    failure.count -= 1;
  }
  return failure;
};
