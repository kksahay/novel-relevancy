function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name}: "${raw}" is not a number`);
  }
  return value;
}

function required(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/**
 * PlanetScale hands out connection strings containing libpq-only options
 * (`sslrootcert=system`) that Bun's driver rejects outright. Strip anything the
 * driver does not understand so a pasted PlanetScale URI works unmodified.
 */
function normalizePostgresUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  try {
    const url = new URL(uri);
    for (const param of ["sslrootcert", "sslcert", "sslkey", "sslcrl", "requirepeer", "krbsrvname"]) {
      url.searchParams.delete(param);
    }
    return url.toString();
  } catch {
    return uri;
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: numFromEnv("PORT", 3001),
  corsOrigin: process.env.CORS_ORIGIN?.trim() || "*",
  pgUri: normalizePostgresUri(required("PG_URI")),
  geminiApiKey: required("GEMINI_API_KEY"),
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  geminiEmbeddingDimensions: numFromEnv("GEMINI_EMBEDDING_DIMENSIONS", 768),
  geminiBatchSize: numFromEnv("GEMINI_BATCH_SIZE", 10),
  geminiMaxConcurrency: numFromEnv("GEMINI_MAX_CONCURRENCY", 3),
  relevanceTopK: numFromEnv("RELEVANCE_TOP_K", 3),
  noveltyTopK: numFromEnv("NOVELTY_TOP_K", 5),
  /**
   * Tuned empirically with `bun run evaluate` against the labelled seed corpus
   * (50 comments, 30 high / 15 low relevance, borderline excluded):
   *
   *   threshold  relevance accuracy  irrelevant-reward-rate
   *   0.65       0.667               1.000
   *   0.70       0.978               0.067
   *   0.72       1.000               0.000
   *   0.75       0.956               0.000
   *
   * Raw cosine for `gemini-embedding-001` clusters in a narrow band, so a gate
   * of 0.65 sits below almost every candidate and lets irrelevant comments
   * through. 0.72 is the empirical boundary between the high (0.734-0.879) and
   * low (0.656-0.709) relevance populations. Override with RELEVANCE_THRESHOLD.
   */
  relevanceThreshold: numFromEnv("RELEVANCE_THRESHOLD", 0.72),
  noveltyWeights: (() => {
    const raw = process.env.NOVELTY_WEIGHTS;
    if (raw) {
      const parsed = raw.split(",").map(Number);
      if (parsed.length === 5 && parsed.every(n => Number.isFinite(n))) return parsed;
    }
    return [0.4, 0.25, 0.15, 0.12, 0.08];
  })(),
  maxWordsPerChunk: numFromEnv("MAX_WORDS_PER_CHUNK", 400),
} as const;

export const isDatabaseConfigured = env.pgUri !== undefined;
export const isGeminiConfigured = env.geminiApiKey !== undefined;

export function assertGeminiConfigured(): void {
  if (!env.geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to apps/api/.env. Get it from Google AI Studio / Vertex AI.",
    );
  }
}

export function assertDatabaseConfigured(): void {
  if (!env.pgUri) {
    throw new Error("PG_URI is not set. Add it to apps/api/.env.");
  }
}
