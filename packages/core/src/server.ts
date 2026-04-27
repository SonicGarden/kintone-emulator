import * as http from "node:http";
import { Readable } from "node:stream";
import * as appRoute from "./handlers/app";
import * as appsRoute from "./handlers/apps";
import { authenticate } from "./handlers/auth";
import * as comment from "./handlers/comment";
import * as fields from "./handlers/fields";
import * as file from "./handlers/file";
import * as finalize from "./handlers/finalize";
import * as initialize from "./handlers/initialize";
import * as layout from "./handlers/layout";
import * as previewFields from "./handlers/preview-fields";
import * as record from "./handlers/record";
import * as records from "./handlers/records";
import * as setupApp from "./handlers/setup-app";
import * as setupAuth from "./handlers/setup-auth";
import * as setupFailure from "./handlers/setup-failure";
import * as setupFailureRateLimit from "./handlers/setup-failure-rate-limit";
import * as setupSpace from "./handlers/setup-space";
import * as status from "./handlers/status";
import type { HandlerArgs } from "./handlers/types";
import { withFailureInjection } from "./handlers/with-failure-injection";

type RouteHandler = (args: HandlerArgs) => Response | Promise<Response>;

type RouteEntry = {
  pattern: RegExp;
  GET?: RouteHandler;
  POST?: RouteHandler;
  PUT?: RouteHandler;
  DELETE?: RouteHandler;
  requiresAuth?: boolean;
  guestSpaceIdGroup?: number;
};

// k/v1 配下のパスは optional に /guest/{N} を許容する。group 1: session, group 2: guestSpaceId
const K = (suffix: string) =>
  new RegExp(`^\\/(?:([^/]+)\\/)?k(?:\\/guest\\/(\\d+))?\\/v1\\/${suffix}$`);

const routes: RouteEntry[] = [
  {
    pattern: /^\/(?:([^/]+)\/)?initialize$/,
    POST: initialize.post,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?finalize$/,
    POST: finalize.post,
  },
  {
    pattern: K("record\\.json"),
    guestSpaceIdGroup: 2,
    GET: record.get,
    POST: record.post,
    PUT: record.put,
    requiresAuth: true,
  },
  {
    pattern: K("records\\.json"),
    guestSpaceIdGroup: 2,
    GET: records.get,
    POST: records.post,
    PUT: records.put,
    DELETE: records.del,
    requiresAuth: true,
  },
  {
    pattern: K("app\\.json"),
    guestSpaceIdGroup: 2,
    GET: appRoute.get,
    requiresAuth: true,
  },
  {
    pattern: K("apps\\.json"),
    guestSpaceIdGroup: 2,
    GET: appsRoute.get,
    requiresAuth: true,
  },
  {
    pattern: K("app\\/status\\.json"),
    guestSpaceIdGroup: 2,
    GET: status.get,
    requiresAuth: true,
  },
  {
    pattern: K("app\\/form\\/fields\\.json"),
    guestSpaceIdGroup: 2,
    GET: fields.get,
    requiresAuth: true,
  },
  {
    pattern: K("app\\/form\\/layout\\.json"),
    guestSpaceIdGroup: 2,
    GET: layout.get,
    requiresAuth: true,
  },
  {
    pattern: K("preview\\/app\\/form\\/fields\\.json"),
    guestSpaceIdGroup: 2,
    POST: previewFields.post,
    DELETE: previewFields.del,
    requiresAuth: true,
  },
  {
    pattern: K("file\\.json"),
    guestSpaceIdGroup: 2,
    GET: file.get,
    POST: file.post,
    requiresAuth: true,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?setup\/app\.json$/,
    POST: setupApp.post,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?setup\/auth\.json$/,
    POST: setupAuth.post,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?setup\/space\.json$/,
    POST: setupSpace.post,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?setup\/failure\.json$/,
    POST: setupFailure.post,
    DELETE: setupFailure.del,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?setup\/failure\/rate-limit\.json$/,
    POST: setupFailureRateLimit.post,
    DELETE: setupFailureRateLimit.del,
  },
  {
    pattern: K("record\\/comment\\.json"),
    guestSpaceIdGroup: 2,
    POST: comment.post,
    DELETE: comment.del,
    requiresAuth: true,
  },
  {
    pattern: K("record\\/comments\\.json"),
    guestSpaceIdGroup: 2,
    GET: comment.get,
    requiresAuth: true,
  },
];

async function toWebRequest(
  req: http.IncomingMessage,
  url: string
): Promise<Request> {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  return new Request(url, {
    method: req.method,
    headers,
    ...(hasBody && {
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      duplex: "half",
    }),
  });
}

async function sendWebResponse(
  webRes: Response,
  res: http.ServerResponse
): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  if (webRes.body) {
    const reader = webRes.body.getReader();
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

async function handler(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const pathname = req.url?.split("?")[0] ?? "/";
  const method = req.method ?? "GET";

  for (const route of routes) {
    const match = pathname.match(route.pattern);
    if (!match) continue;

    const session = match[1];
    const routeHandler = route[method as keyof RouteEntry] as
      | RouteHandler
      | undefined;

    if (!routeHandler) {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: "Method Not Allowed" }));
      return;
    }

    try {
      const url = `http://localhost${req.url}`;
      const webReq = await toWebRequest(req, url);

      // 実機 kintone の LB レベルのエラー (503/429 等) は auth より手前で発生するため、
      // failure injection を auth より先に評価する。
      const authedHandler: RouteHandler = (args) => {
        if (route.requiresAuth) {
          const authResult = authenticate(args.request, session);
          if (authResult) return authResult;
        }
        return routeHandler(args);
      };
      const wrapped = route.requiresAuth ? withFailureInjection(authedHandler) : authedHandler;
      const guestSpaceId = route.guestSpaceIdGroup != null ? match[route.guestSpaceIdGroup] : undefined;
      const webRes = await wrapped({
        request: webReq,
        params: { session, guestSpaceId },
      });
      await sendWebResponse(webRes, res);
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: String(e) }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ message: "Not Found" }));
}

export function startServer(port = 0): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(port, () => resolve(server));
  });
}
