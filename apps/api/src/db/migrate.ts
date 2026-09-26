import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { env } from "../env";
import * as schema from "./schema";

const migrationsFolder = join(import.meta.dir, "../../drizzle");
const migrationsSchema = "novel_relevancy";
const migrationsTable = "__migrations";

async function main(): Promise<void> {
  if (!env.pgUri) {
    console.error("[FAIL] PG_URI is not set. Add it to apps/api/.env.");
    process.exit(1);
  }

  const client = new Bun.SQL(env.pgUri);
  const db = drizzle({ client, schema });

  try {
    try {
      await client`CREATE EXTENSION IF NOT EXISTS vector`;
      console.log("vector extension verified");
    } catch (error) {
      throw new Error(`could not enable the vector extension: ${(error as Error).message}`);
    }

    await client.unsafe(`CREATE SCHEMA IF NOT EXISTS ${migrationsSchema}`);
    await migrate(db, { migrationsFolder, migrationsSchema, migrationsTable });
    console.log("Migrations up to date.");
  } finally {
    await client.end();
  }
}

await main().catch((error: Error) => {
  console.error(`\n[FAIL] Migration failed: ${error.message}`);
  process.exit(1);
});
