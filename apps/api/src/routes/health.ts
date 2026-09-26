import type { BunRequest } from "bun";
import { env, isDatabaseConfigured } from "../env";
import { json } from "../lib/http";

const startedAt = Date.now();

export const healthRoutes = {
  "/api/health": {
    GET: () =>
      json({
        status: "ok",
        service: "novel-relevancy-api",
        environment: env.nodeEnv,
        database: isDatabaseConfigured ? "configured" : "not-configured",
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
      }),
  },

  "/api/hello": {
    GET: () => json({ message: "Hello, world!", method: "GET" }),
    PUT: () => json({ message: "Hello, world!", method: "PUT" }),
  },

  "/api/hello/:name": {
    GET: (req: BunRequest<"/api/hello/:name">) => json({ message: `Hello, ${req.params.name}!` }),
  },
};
