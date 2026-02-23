import { getHost } from "tests/config";

export const createBaseUrl = (session: string): string =>
  `http://${getHost()}/${session}-${process.pid}`;

export const initializeSession = (baseUrl: string) =>
  fetch(`${baseUrl}/initialize`, { method: "POST" });

export const finalizeSession = (baseUrl: string) =>
  fetch(`${baseUrl}/finalize`, { method: "POST" });

export const createApp = async (
  baseUrl: string,
  params: { name: string; properties?: Record<string, unknown>; layout?: unknown[] }
): Promise<number> => {
  const response = await fetch(`${baseUrl}/setup/app.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`createApp failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return Number(data.app);
};
