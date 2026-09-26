import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "../env";
import { HttpError } from "../lib/http";
import * as schema from "./schema";

function createDatabase(pgUri: string) {
  return drizzle({ connection: pgUri, schema });
}

export type Database = ReturnType<typeof createDatabase>;

/**
 * Bun.sql-backed Drizzle client. Created lazily so the server can boot before
 * PG_URI exists - DB-backed routes then answer 503 until it is configured.
 */
export const db: Database | undefined = env.pgUri ? createDatabase(env.pgUri) : undefined;

export function requireDb(): Database {
  if (!db) {
    throw new HttpError(503, "Postgres is not configured. Set PG_URI in apps/api/.env and restart.");
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  await db?.$client.end();
}
