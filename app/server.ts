import * as http from "node:http";
import { Readable } from "node:stream";
import type { AppLoadContext } from "@remix-run/node";
import * as initialize from "~/routes/($session).initialize";
import * as finalize from "~/routes/($session).finalize";
import * as record from "~/routes/($session).k.v1.record[.]json";
import * as records from "~/routes/($session).k.v1.records[.]json";
import * as appRoute from "~/routes/($session).k.v1.app[.]json";
import * as appsRoute from "~/routes/($session).k.v1.apps[.]json";
import * as fields from "~/routes/($session).k.v1.app.form.fields[.]json";
import * as layout from "~/routes/($session).k.v1.app.form.layout[.]json";
import * as previewFields from "~/routes/($session).k.v1.preview.app.form.fields[.]json";
import * as file from "~/routes/($session).k.v1.file[.]json";
import * as setupApp from "~/routes/($session).setup.app[.]json";

type RouteHandler = (args: {
  request: Request;
  params: Record<string, string | undefined>;
  context: AppLoadContext;
}) => Promise<Response>;

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
    POST: initialize.action,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?finalize$/,
    POST: finalize.action,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/record\.json$/,
    GET: record.loader,
    POST: record.action,
    PUT: record.action,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/records\.json$/,
    GET: records.loader,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/app\.json$/,
    GET: appRoute.loader,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/apps\.json$/,
    GET: appsRoute.loader,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/app\/form\/fields\.json$/,
    GET: fields.loader,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/app\/form\/layout\.json$/,
    GET: layout.loader,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/preview\/app\/form\/fields\.json$/,
    POST: previewFields.action,
    DELETE: previewFields.action,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?k\/v1\/file\.json$/,
    GET: file.loader,
    POST: file.action,
  },
  {
    pattern: /^\/(?:([^/]+)\/)?setup\/app\.json$/,
    POST: setupApp.action,
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
        context: {} as AppLoadContext,
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

export function startServer(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(port, () => resolve(server));
  });
}
