import * as http from "node:http";
import { Readable } from "node:stream";
import * as initialize from "./handlers/initialize";
import * as finalize from "./handlers/finalize";
import * as record from "./handlers/record";
import * as records from "./handlers/records";
import * as appRoute from "./handlers/app";
import * as appsRoute from "./handlers/apps";
import * as fields from "./handlers/fields";
import * as layout from "./handlers/layout";
import * as previewFields from "./handlers/preview-fields";
import * as file from "./handlers/file";
import * as setupApp from "./handlers/setup-app";
import type { HandlerArgs } from "./handlers/types";

type RouteHandler = (args: HandlerArgs) => Promise<Response>;

type RouteEntry = {
  pattern: RegExp;
  GET?: RouteHandler;
  POST?: RouteHandler;
  PUT?: RouteHandler;
  DELETE?: RouteHandler;
};

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
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/record\.json$/,
    GET: record.get,
    POST: record.post,
    PUT: record.put,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/records\.json$/,
    GET: records.get,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/app\.json$/,
    GET: appRoute.get,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/apps\.json$/,
    GET: appsRoute.get,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/app\/form\/fields\.json$/,
    GET: fields.get,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/app\/form\/layout\.json$/,
    GET: layout.get,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/preview\/app\/form\/fields\.json$/,
    POST: previewFields.post,
    DELETE: previewFields.del,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/file\.json$/,
    GET: file.get,
    POST: file.post,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?setup\/app\.json$/,
    POST: setupApp.post,
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
      const webRes = await routeHandler({
        request: webReq,
        params: { session },
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
