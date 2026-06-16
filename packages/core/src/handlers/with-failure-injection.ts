import { consumeFailure } from "../db/failure-injection";
import type { HandlerArgs } from "./types";

export const withFailureInjection =
  (handler: (args: HandlerArgs) => Response | Promise<Response>) =>
  (args: HandlerArgs): Response | Promise<Response> => {
    const url = new URL(args.request.url);
    const failure = consumeFailure(args.params.session, url.pathname);
    if (!failure) return handler(args);

    const body =
      typeof failure.body === "string" ? failure.body : JSON.stringify(failure.body);
    return new Response(body, {
      status: failure.status,
      headers: {
        "Content-Type": failure.contentType,
        ...(failure.extraHeaders ?? {}),
      },
    });
  };
