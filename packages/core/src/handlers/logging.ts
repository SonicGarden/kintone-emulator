import type { HandlerArgs } from "./types";

type Handler = (args: HandlerArgs) => Response | Promise<Response>;
type LogLevel = "off" | "info" | "verbose";

const getLogLevel = (): LogLevel => {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level === "info" || level === "verbose") return level;
  return "off";
};

const readRequestBody = async (request: Request): Promise<string | undefined> => {
  const method = request.method;
  if (method === "GET" || method === "HEAD") return undefined;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return await request.clone().text();
    } catch {
      return "<unreadable>";
    }
  }
  if (contentType.includes("multipart")) return "<multipart form data>";
  return "<non-json body>";
};

const readResponseBody = async (response: Response): Promise<string | undefined> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return await response.clone().text();
    } catch {
      return "<unreadable>";
    }
  }
  return undefined;
};

export const withLogging =
  (handler: Handler): Handler =>
  async (args) => {
    const logLevel = getLogLevel();
    if (logLevel === "off") return handler(args);

    const { request } = args;
    const requestBody = logLevel === "verbose" ? await readRequestBody(request) : undefined;

    const start = performance.now();
    const response = await handler(args);
    const elapsed = (performance.now() - start).toFixed(1);

    const responseBody = logLevel === "verbose" ? await readResponseBody(response) : undefined;

    console.log(
      `[${request.method}] ${request.url} => ${response.status} (${elapsed}ms)` +
        (requestBody ? `\n  req: ${requestBody}` : "") +
        (responseBody ? `\n  res: ${responseBody}` : ""),
    );

    return response;
  };
