import { serve } from "bun";
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001";

/**
 * Proxies every /api/* request to the API workspace so the browser only ever
 * talks to a single origin (no CORS needed in the app itself).
 */
async function proxyToApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = new URL(url.pathname + url.search, apiOrigin);

  const headers = new Headers(req.headers);
  headers.delete("host");

  const method = req.method.toUpperCase();
  const init: RequestInit = { method, headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") {
    init.body = req.body;
  }

  try {
    const upstream = await fetch(target, init);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-length");
    responseHeaders.delete("content-encoding");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[web] proxy to ${target.href} failed:`, error);
    return Response.json({ error: "API unavailable" }, { status: 502 });
  }
}

const server = serve({
  port,
  routes: {
    "/api/*": proxyToApi,

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Web server running at ${server.url}`);
console.log(`   Proxying /api/* to ${apiOrigin}`);
