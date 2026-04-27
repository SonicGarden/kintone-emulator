/**
 * kintone メンテナンス時のレスポンス観測スクリプト
 *
 * 想定: 2026-05-10 01:00-07:00 JST のメンテ時間帯に実行する。
 *
 * 必要な環境変数:
 *   KINTONE_DOMAIN   - サブドメイン (例: example → https://example.cybozu.com)
 *   KINTONE_USER     - ユーザー名
 *   KINTONE_PASSWORD - パスワード
 *   KINTONE_APP_ID   - 観測対象のアプリID（数値）
 *
 * 使い方:
 *   pnpm tsx scripts/observe-maintenance.ts                 # 1サイクル実行
 *   while true; do pnpm tsx scripts/observe-maintenance.ts; sleep 300; done
 *
 *   または cron で 5 分おき:
 *   * * * * * cd /workspace && pnpm tsx scripts/observe-maintenance.ts >> tmp/logs/cron.log 2>&1
 *
 * 出力: tmp/logs/{lang}/{transport}/{ISO_TIMESTAMP}-{status}.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";

const DOMAIN = required("KINTONE_DOMAIN");
const USER = required("KINTONE_USER");
const PASSWORD = required("KINTONE_PASSWORD");
const APP_ID = Number(required("KINTONE_APP_ID"));

const BASE_URL = `https://${DOMAIN}.cybozu.com`;
const LANGS = ["ja", "en", "zh-CN"] as const;
const AUTH_HEADER = Buffer.from(`${USER}:${PASSWORD}`).toString("base64");

type ApiSpec = {
  name: string;
  path: string;
  query: Record<string, string | number>;
  // KintoneRestAPIClient での呼び出し
  callClient: (c: KintoneRestAPIClient) => Promise<unknown>;
};

const APIS: ApiSpec[] = [
  {
    name: "app",
    path: "/k/v1/app.json",
    query: { id: APP_ID },
    callClient: (c) => c.app.getApp({ id: APP_ID }),
  },
];

async function main() {
  const startedAt = new Date().toISOString();
  const tsSegment = startedAt.replace(/[:.]/g, "-");

  console.log(`[observe] start ${startedAt}`);

  for (const lang of LANGS) {
    for (const api of APIS) {
      // 1. 生 fetch
      const fetchResult = await observeFetch(api, lang);
      await save(lang, "fetch", tsSegment, fetchResult.status, fetchResult);

      // 2. KintoneRestAPIClient
      const clientResult = await observeClient(api, lang);
      const clientStatus =
        (clientResult as any).httpStatus ?? clientResult.kind;
      await save(lang, "client", tsSegment, clientStatus, clientResult);

      console.log(
        `[observe] ${lang} ${api.name}: fetch=${fetchResult.status} client=${clientStatus}`,
      );
    }
  }

  console.log(`[observe] done ${new Date().toISOString()}`);
}

async function save(
  lang: string,
  transport: "fetch" | "client",
  ts: string,
  status: string | number,
  payload: unknown,
) {
  const dir = join("tmp", "logs", lang, transport);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${ts}-${status}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2));
}

async function observeFetch(api: ApiSpec, lang: string) {
  const url = new URL(api.path, BASE_URL);
  for (const [k, v] of Object.entries(api.query)) {
    url.searchParams.set(k, String(v));
  }
  const observedAt = new Date().toISOString();
  try {
    const res = await fetch(url, {
      headers: {
        "X-Cybozu-Authorization": AUTH_HEADER,
        "Accept-Language": lang,
      },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    const bodyText = await res.text();
    return {
      observedAt,
      url: url.toString(),
      lang,
      status: res.status,
      statusText: res.statusText,
      headers,
      bodyText,
      bodyJson: tryParseJson(bodyText),
    };
  } catch (e) {
    return {
      observedAt,
      url: url.toString(),
      lang,
      status: "FETCH_THREW",
      error: serializeError(e),
    };
  }
}

async function observeClient(api: ApiSpec, lang: string) {
  const observedAt = new Date().toISOString();
  const client = new KintoneRestAPIClient({
    baseUrl: BASE_URL,
    auth: { username: USER, password: PASSWORD },
    // rest-api-client は内部で axios を使うので headers をマージ可能
    headers: { "Accept-Language": lang } as Record<string, string>,
  });
  try {
    const data = await api.callClient(client);
    return { observedAt, lang, kind: "ok", httpStatus: 200, data };
  } catch (e) {
    const error = serializeError(e);
    return {
      observedAt,
      lang,
      kind: "throw",
      httpStatus: error.httpStatus ?? "throw",
      error,
    };
  }
}

function serializeError(e: unknown): Record<string, unknown> {
  if (!(e instanceof Error)) return { raw: String(e) };
  const anyE = e as any;
  return {
    name: e.name,
    constructor: e.constructor?.name,
    message: e.message,
    code: anyE.code,
    id: anyE.id,
    errors: anyE.errors,
    httpStatus: anyE.response?.status ?? anyE.status,
    httpStatusText: anyE.response?.statusText,
    responseHeaders: anyE.response?.headers,
    responseData: anyE.response?.data,
    stack: e.stack,
  };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`環境変数 ${name} が必要です`);
    process.exit(1);
  }
  return v;
}

main().catch((e) => {
  console.error("[observe] fatal", e);
  process.exit(1);
});
