# novel-relevancy

A Bun-first monorepo — React + Tailwind frontend served by a Bun HTTP server, backed by a Bun + Drizzle (Postgres via Bun.sql) API workspace.

## Workspaces

| workspace | package | role |
|---|---|---|
| `apps/web` | `@novel-relevancy/web` | React + Tailwind + shadcn/ui app |
| `apps/api` | `@novel-relevancy/api` | `Bun.serve` API — Drizzle ORM + Postgres via `bun:sql` |
| `packages/shared` | `@novel-relevancy/shared` | Types and route constants used by both apps |

Install once from the repo root:

```bash
bun install
```

## Scripts

Root scripts use Bun workspaces and run the matching script in every workspace that defines it.

```bash
bun run dev          # Start web (3000) and API (3001) in parallel
bun run build        # Build the web app into apps/web/dist
bun run start        # Start both apps in production mode
bun run typecheck    # Run tsc --noEmit in every workspace
bun run db:generate  # Generate a Drizzle SQL migration
bun run db:migrate   # Apply migrations against PG_URI
```

Individual packages:

```bash
bun --filter "@novel-relevancy/web" dev
bun --filter "@novel-relevancy/api" dev
```

## Quick start

```bash
# API — provide a Postgres connection string
cd apps/api
cp .env.example .env
# edit .env and set PG_URI, then:
bun run db:generate
bun run db:migrate
bun run dev

# Web
cd apps/web
bun run dev
# The web server proxies /api/* to the API automatically.
```

## Environment variables

### apps/api/.env

```env
PORT=3001
NODE_ENV=development
PG_URI=postgres://user:password@localhost:5432/novel_relevancy
CORS_ORIGIN=*
```

- **`PG_URI`** — Postgres connection string consumed by `Bun.sql` and Drizzle.
  If unset, the API boots and serves non-DB routes; every database route answers `503`.
- **`CORS_ORIGIN`** — Origin allowed on direct API calls (default `*`).

### apps/web/.env

```env
PORT=3000
API_ORIGIN=http://localhost:3001
```

`API_ORIGIN` is the address the web server proxies `/api/*` requests to.

## Adding a new API route

1. Define the schema in `apps/api/src/db/schema.ts`.
2. Regenerate the migration: `bun run db:generate`.
3. Add handlers under `apps/api/src/routes/` and wire them in `src/routes/index.ts`.
4. Add matching types under `packages/shared`.

## Structure

```
apps/web/
  src/            # React app, served by Bun (HTML imports)
  build.ts        # Bun bundler build (static output → dist/)
  bunfig.toml     # Tailwind plugin for dev serving
  tsconfig.json
apps/api/
  src/
    index.ts      # Bun.serve entry (routes + graceful shutdown)
    env.ts        # Process env validation
    db/client.ts  # Drizzle + bun:sql client
    db/schema.ts  # Drizzle table definitions
    db/migrate.ts # Runtime migration runner
    routes/       # Route handlers
  drizzle.config.ts
  drizzle/        # Generated SQL migrations (committed)
packages/shared/  # Shared TypeScript types & route constants
```

## Notes

- The API uses `Bun.sql` (not `pg`/`postgres.js`) as its Postgres driver, wired into Drizzle via `drizzle-orm/bun-sql`.
- Requests to `/api/*` from the browser hit the web server and are proxied to the API — no CORS needed in the app. CORS headers are added by the API for direct callers.
- Every API handler returns JSON and a proper HTTP status (400 validation, 404 not found, 409 conflict, 503 service unavailable when PG_URI is missing).
- The server shuts down cleanly on SIGINT/SIGTERM and closes the Bun.sql pool.
