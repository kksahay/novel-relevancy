import { env } from "../env";
import { errorResponse, HttpError } from "./http";
import { logger } from "./logger";

/** Adds CORS headers so the API can also be called directly from another origin. */
export function applyCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", env.corsOrigin);
  headers.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization");
  headers.set("access-control-max-age", "86400");

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function preflight(): Response {
  return new Response(null, { status: 204 });
}

type AnyHandler = (req: Request, server: unknown) => unknown;

function wrapHandler(handler: AnyHandler): (req: Request, server: unknown) => Promise<Response> {
  return async (req, server) => {
    const startedAt = performance.now();
    let res: Response;

    try {
      if (req.method.toUpperCase() === "OPTIONS") {
        res = preflight();
      } else {
        const result = await handler(req, server);
        if (!(result instanceof Response)) {
          throw new HttpError(500, "Handler did not return a Response");
        }
        res = result;
      }
    } catch (error) {
      res = errorResponse(error);
    }

    const response = applyCors(res);
    const pathname = new URL(req.url).pathname;
    logger.info(`${req.method} ${pathname} ${response.status} ${Math.round(performance.now() - startedAt)}ms`);
    return response;
  };
}

/**
 * Wraps every handler in a route map with cross-cutting behaviour:
 * CORS headers, error-to-JSON mapping and request logging.
 *
 * The input type is returned unchanged so route paths and `req.params`
 * stay fully typed at the call site.
 */
export function withCommon<T extends Record<string, unknown>>(routeMap: T): T {
  const wrapped: Record<string, unknown> = {};

  for (const [path, entry] of Object.entries(routeMap)) {
    if (typeof entry === "function") {
      wrapped[path] = wrapHandler(entry as AnyHandler);
    } else if (entry instanceof Response) {
      wrapped[path] = entry;
    } else if (typeof entry === "object" && entry !== null) {
      const methods: Record<string, unknown> = {};
      for (const [method, value] of Object.entries(entry)) {
        methods[method] = typeof value === "function" ? wrapHandler(value as AnyHandler) : value;
      }
      wrapped[path] = methods;
    } else {
      wrapped[path] = entry;
    }
  }

  return wrapped as T;
}
