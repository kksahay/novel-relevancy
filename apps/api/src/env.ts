function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`Invalid ${name}: expected an integer between 0 and 65535, got "${raw}"`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: intFromEnv("PORT", 3001),
  corsOrigin: process.env.CORS_ORIGIN?.trim() || "*",
  /** Postgres connection string. Undefined until PG_URI is provided. */
  pgUri: process.env.PG_URI?.trim() || undefined,
} as const;

export const isDatabaseConfigured = env.pgUri !== undefined;
