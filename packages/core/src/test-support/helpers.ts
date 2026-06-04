// エミュレーターに対する HTTP プリミティブ。
// baseUrl のホストは `configureTestEnv({ emulatorHost })` で指定する（未指定なら
// `process.env.TEST_PORT` を参照した `localhost:<port>` にフォールバック）。

import { getTestEnv } from "./config";

const getHost = (): string => {
  const configured = getTestEnv().emulatorHost;
  if (configured) return configured;
  return `localhost:${process.env.TEST_PORT ?? "12345"}`;
};

export const createBaseUrl = (session: string): string =>
  `http://${getHost()}/${session}-${process.pid}`;

export const initializeSession = (baseUrl: string) =>
  fetch(`${baseUrl}/initialize`, { method: "POST" });

export const finalizeSession = (baseUrl: string) =>
  fetch(`${baseUrl}/finalize`, { method: "POST" });

export const setupAuth = async (
  baseUrl: string,
  username: string,
  password: string,
): Promise<void> => {
  const response = await fetch(`${baseUrl}/setup/auth.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`setupAuth failed: ${response.status} ${response.statusText}`);
  }
};

export const setupSpace = async (
  baseUrl: string,
  params: { id?: number; isGuest?: boolean; name?: string } = {},
): Promise<{ id: number }> => {
  const response = await fetch(`${baseUrl}/setup/space.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`setupSpace failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<{ id: number }>;
};

export type CreateAppResult = {
  appId: number;
  recordIds: number[];
};

export const createApp = async (
  baseUrl: string,
  params: {
    id?: number;
    name: string;
    properties?: Record<string, unknown>;
    layout?: unknown[];
    status?: unknown;
    records?: unknown[];
    spaceId?: number;
    threadId?: number;
  },
): Promise<CreateAppResult> => {
  const response = await fetch(`${baseUrl}/setup/app.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`createApp failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as {
    app: number | string;
    recordIds?: (number | string)[];
  };
  return {
    appId: Number(data.app),
    recordIds: (data.recordIds ?? []).map(Number),
  };
};
