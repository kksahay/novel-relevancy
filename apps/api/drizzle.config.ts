import { defineConfig } from "drizzle-kit";

const url = process.env.PG_URI?.trim();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: url ?? "",
  },
});
