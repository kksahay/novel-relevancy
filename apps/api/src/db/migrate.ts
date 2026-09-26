import { migrate } from "drizzle-orm/bun-sql/migrator";
import { db } from "./client";

if (!db) {
  console.error("PG_URI is not set - cannot apply migrations.");
  process.exit(1);
}

const migrationsFolder = `${import.meta.dir}/../../drizzle`;

await migrate(db, { migrationsFolder });
console.log(`Migrations applied from ${migrationsFolder}`);
