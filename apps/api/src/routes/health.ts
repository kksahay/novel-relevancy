import { json } from "../lib/http";
import { env } from "../env";

const startedAt = Date.now();

export const healthRoutes = {
  "/api/health": {
    GET: () =>
      json({
        ok: true,
        service: "novel-relevancy-api",
        environment: env.nodeEnv,
        database: env.pgUri ? "configured" : "not-configured",
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      }),
  },
};
