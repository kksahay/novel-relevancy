import { serve } from "bun";
import { closeDatabase } from "./db/client";
import { env, isDatabaseConfigured } from "./env";
import { json, notFound } from "./lib/http";
import { applyCors } from "./lib/middleware";
import { logger } from "./lib/logger";
import { routes } from "./routes";

/** Fallback for anything the route table did not match (incl. CORS preflight). */
function fallback(req: Request): Response {
  const res = req.method.toUpperCase() === "OPTIONS" ? new Response(null, { status: 204 }) : notFound();
  return applyCors(res);
}

const server = serve({
  port: env.port,
  routes,
  fetch: fallback,
});

logger.info(`API running at ${server.url}`);
if (!isDatabaseConfigured) {
  logger.warn("PG_URI is not set - database routes will answer 503 until it is configured.");
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down...`);
  await server.stop();
  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("beforeExit", () => void closeDatabase());

// `bun --hot` re-evaluates this module on every change. Without an explicit
// teardown each reload would leave its previous connection pool open, which
// exhausts the database's connection slots after a handful of edits.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void server.stop(true);
    void closeDatabase();
  });
}
