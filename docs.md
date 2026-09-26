# Novelty Reward POC — Documentation

A Bun + TypeScript monorepo that scores a user-generated comment against one fixed
article and answers two independent questions:

1. **Relevance** — does the comment meaningfully relate to the article?
2. **Novelty** — how different is the comment from ~50 comments already written about
   the same article?

The final reward is a hard relevance gate followed by calibrated novelty:

```text
if relevance < threshold:  reward = 0
else:                      reward = normalized_novelty
```

The point of the gate is that a highly novel but irrelevant comment must earn nothing.

---

## Table of contents

- [What this is](#what-this-is)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Every command](#every-command)
- [Data model](#data-model)
- [The scoring pipeline](#the-scoring-pipeline)
- [Relevance algorithm](#relevance-algorithm)
- [Novelty algorithm](#novelty-algorithm)
- [Novelty calibration](#novelty-calibration)
- [Reward rule](#reward-rule)
- [API reference](#api-reference)
- [Frontend](#frontend)
- [Seed dataset](#seed-dataset)
- [Evaluation runner and metrics](#evaluation-runner-and-metrics)
- [Testing](#testing)
- [Local Postgres bootstrap](#local-postgres-bootstrap)
- [Troubleshooting](#troubleshooting)
- [Design decisions](#design-decisions)
- [Known limitations](#known-limitations)
- [Deploying to Cloudflare](#deploying-to-cloudflare)

---

## What this is

A judge-facing demo console for a "reward novelty in submissions" POC.

- One **fixed article** is stored and chunked into embedded chunks.
- Roughly **50 existing comments** form the novelty comparison corpus.
- A **new candidate comment** is embedded once and scored:
  - cosine relevance against the article's chunks,
  - top-K weighted similarity against the corpus,
  - leave-one-out percentile calibration of that novelty,
  - a reward gated on relevance.
- Every intermediate value (relevance, raw novelty, calibrated novelty, reward,
  nearest neighbours) is returned and rendered so a human can see *why* a score
  was given.

---

## Architecture

```text
apps/web  (Bun.serve + React 19 + shadcn/ui + TanStack Query)
   │  same-origin /api/*  (proxied to :3001)
   ▼
apps/api  (Bun.serve, no framework)
   routes → services (embedding, chunking, evaluation) → repositories → Drizzle
   │                                    │
   │                                    └── Gemini gemini-embedding-001 (768-dim)
   ▼
Bun.SQL → PlanetScale Postgres 18 + pgvector
```

Layering inside `apps/api`:

| Layer | Location | Responsibility |
|---|---|---|
| Routes | `src/routes/` | HTTP shape, status codes, validation entry |
| Services | `src/services/` | Embeddings, chunking, the scoring algorithm, eval runner |
| Domain utils | `src/lib/similarity.ts` | Pure math: cosine, top-K, novelty, percentile, clamp |
| Repositories | `src/repositories/` | All SQL / persistence |
| Database | `src/db/` | Schema, Drizzle client, migrations, seed |

Monorepo layout:

```text
apps/
  api/          Bun API, scoring engine, Drizzle schema, migrations, seed, tests
  web/          React dashboard served by Bun.serve, proxies /api to the API
packages/
  shared/       Shared TypeScript types and canonical API route helpers
scripts/
  run-local.ts  One-command local bootstrap
```

---

## Tech stack

| Concern | Choice |
|---|---|
| Runtime / package manager / bundler | **Bun 1.4+** (no Node, no Vite, no npm/pnpm) |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) |
| Frontend | React 19, TanStack Query v5, shadcn/ui (Radix + Tailwind v4) |
| HTTP | `Bun.serve` with native route table (no Express) |
| Database | PlanetScale Postgres 18 + `pgvector` |
| ORM | Drizzle ORM + Drizzle Kit |
| DB driver | `Bun.SQL` (not `pg`) |
| Embeddings | `@google/genai`, model `gemini-embedding-001`, 768 dims, task type `SEMANTIC_SIMILARITY` |
| Validation | Zod v4 |
| Tests | `bun test` |

Project rule (`.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc`): use Bun
primitives — `Bun.serve`, `Bun.SQL`, `Bun.file`, `Bun.$`, `Bun.spawn`, `bun test`,
`bun build` — and avoid `pg`, Express, dotenv, Vite, Jest, and the npm/pnpm/yarn CLIs.

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) 1.4 or newer
- A Postgres database with the `vector` extension. Either:
  - **PlanetScale** (recommended for the demo) — you need a connection string with
    permission to run DDL, or
  - **Local Postgres** — `run-local` will start one in Docker for you
- A [Google AI Studio](https://aistudio.google.com/apikey) API key for embeddings

### The one command

```bash
bun run run-local
```

This single command:

1. Installs dependencies if `node_modules` is missing.
2. Checks your database — if `PG_URI` works it proceeds silently; if it is missing
   or a local server is down it offers to start Postgres in Docker (see
   [Local Postgres bootstrap](#local-postgres-bootstrap)).
3. Applies migrations.
4. Seeds the demo article and its 50-comment corpus.
5. Starts the API on **:3001** and the web app on **:3000**, waits for both to be
   healthy, then stays in the foreground.

Then open **<http://localhost:3000>**.

Press `Ctrl+C` to stop both servers.

### Manual setup

If you prefer the individual steps:

```bash
bun install

cp apps/api/.env.example apps/api/.env
# edit apps/api/.env: set PG_URI and GEMINI_API_KEY

bun run db:migrate
bun run db:seed

# terminal 1
bun run --filter '@novel-relevancy/api' dev     # API on :3001

# terminal 2
bun run --filter '@novel-relevancy/web' dev     # web on :3000
```

Or run both dev servers in parallel from the root:

```bash
bun run dev
```

---

## Configuration

All configuration is environment-based and read in `apps/api/src/env.ts`. Copy
`apps/api/.env.example` to `apps/api/.env` and fill it in. `.env` is gitignored
(and Bun loads it automatically — no `dotenv` needed).

### Server

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | API port |
| `NODE_ENV` | `development` | Runtime mode |
| `CORS_ORIGIN` | `*` | Allowed browser origin for direct API calls |

### Database

| Variable | Default | Purpose |
|---|---|---|
| `PG_URI` | *(empty)* | Postgres connection string. Empty means DB routes answer `503` |
| `PG_POOL_MAX` | `5` | Max pooled connections. Kept low for PlanetScale limits |
| `PG_POOL_IDLE_TIMEOUT` | `10` | Seconds before an idle connection is closed |

`PG_URI` is normalized at load time: libpq-only parameters that Bun's driver
rejects (`sslrootcert`, `sslcert`, `sslkey`, `sslcrl`, `requirepeer`, `krbsrvname`)
are stripped, so a connection string copied verbatim from the PlanetScale dashboard
works without editing.

### Embeddings

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | *(empty)* | **Required** for seeding and scoring |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model |
| `GEMINI_EMBEDDING_DIMENSIONS` | `768` | Must match the `vector(768)` column |
| `GEMINI_BATCH_SIZE` | `10` | Texts per embedding request |
| `GEMINI_MAX_CONCURRENCY` | `3` | Parallel embedding requests |

### Scoring

| Variable | Default | Purpose |
|---|---|---|
| `RELEVANCE_TOP_K` | `3` | Article chunks averaged for relevance |
| `NOVELTY_TOP_K` | `5` | Nearest corpus comments weighted for novelty |
| `RELEVANCE_THRESHOLD` | `0.72` | The hard relevance gate (see below) |
| `NOVELTY_WEIGHTS` | `0.40,0.25,0.15,0.12,0.08` | Descending weights over the 5 nearest comments |
| `MAX_WORDS_PER_CHUNK` | `400` | Article chunking size |

> **Why `0.72` and not `0.65`?** The threshold was measured, not guessed. Running
> `bun run evaluate` against the labelled seed corpus produced:
>
> | threshold | relevance accuracy | irrelevant-reward rate |
> |---|---|---|
> | 0.65 | 0.667 | 1.000 |
> | 0.70 | 0.978 | 0.067 |
> | **0.72** | **1.000** | **0.000** |
> | 0.75 | 0.956 | 0.000 |
>
> Raw cosine for `gemini-embedding-001` occupies a narrow band, so a 0.65 gate
> sits below nearly every candidate and lets irrelevant comments through. At 0.72
> the high-relevance population (0.734–0.879) and low-relevance population
> (0.656–0.709) are perfectly separated. Override it any time with
> `RELEVANCE_THRESHOLD`.

### Web server

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Web port |
| `API_ORIGIN` | `http://localhost:3001` | Where `/api/*` is proxied |

---

## Every command

Run from the repository root.

| Command | What it does |
|---|---|
| `bun run run-local` | **Main entry point.** Bootstrap DB, migrate, seed, run API + web |
| `bun install` | Install workspace dependencies |
| `bun run dev` | Run every workspace's `dev` script in parallel |
| `bun run build` | Production build of all workspaces |
| `bun run start` | Run every workspace's `start` script |
| `bun run typecheck` | Typecheck root scripts **and** all workspaces |
| `bun test` | Run the test suite |
| `bun run db:generate` | Generate a SQL migration from the Drizzle schema |
| `bun run db:migrate` | Apply pending migrations (idempotent) |
| `bun run db:seed` | Create/refresh the demo article and 50-comment corpus |
| `bun run evaluate` | Run behavioural probes + metrics report |

Workspace-scoped equivalents:

```bash
bun run --filter '@novel-relevancy/api' db:migrate
bun run --filter '@novel-relevancy/api' evaluate
bun run --filter '@novel-relevancy/web' build
```

### Changing the database schema

```bash
# 1. edit apps/api/src/db/schema.ts
# 2. generate a migration
bun run db:generate
# 3. apply it
bun run db:migrate
```

---

## Data model

Four tables, defined once in `apps/api/src/db/schema.ts` (Drizzle is the source of
truth — there is no hand-written SQL schema to keep in sync).

### `articles`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `title` | `varchar(500)` | not null |
| `content` | `text` | not null, any length |
| `created_at` | `timestamptz` | default `now()` |

### `article_chunks`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `article_id` | `uuid` FK → `articles.id` | `ON DELETE CASCADE` |
| `chunk_index` | `integer` | not null |
| `content` | `text` | not null |
| `embedding` | `vector(768)` | pgvector |
| `created_at` | `timestamptz` | default `now()` |

Indexes: `article_chunks_article_id_idx`, and a **unique** index on
`(article_id, chunk_index)` so re-chunking upserts instead of duplicating.

### `submissions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `article_id` | `uuid` FK → `articles.id` | `ON DELETE CASCADE` |
| `headline` | `varchar(200)` | not null |
| `body` | `text` | not null, under 100 words |
| `stance` | `text` | `CHECK (stance IN ('support','oppose','mixed'))` |
| `embedding` | `vector(768)` | one per submission, never chunked |
| `created_at` | `timestamptz` | default `now()` |

Index: `submissions_article_id_idx`. Stance is validated in the app (Zod) **and**
in the database (check constraint).

### `evaluations`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `article_id` | `uuid` FK → `articles.id` | `ON DELETE CASCADE` |
| `candidate_submission_id` | `uuid` FK → `submissions.id` | `ON DELETE CASCADE` |
| `relevance_score` | `double precision` | not null |
| `relevance_threshold` | `double precision` | stored per row so history stays reproducible |
| `relevance_passed` | `boolean` | not null |
| `raw_novelty` | `double precision` | not null |
| `normalized_novelty` | `double precision` | not null |
| `reward_score` | `double precision` | not null |
| `created_at` | `timestamptz` | default `now()` |

Indexes: `evaluations_article_id_idx`, `evaluations_candidate_submission_id_idx`.

### Migration ledger

Drizzle's migrator keeps its ledger in a dedicated schema so it never collides
with other applications sharing the database:

```text
schema:  novel_relevancy
table:   __migrations
```

`bun run db:migrate` first runs `CREATE EXTENSION IF NOT EXISTS vector`, then
applies only pending migrations. Running it repeatedly is safe and prints
`Migrations up to date.`

---

## The scoring pipeline

`evaluateCandidate()` in `apps/api/src/services/evaluation.ts` is the single
orchestration point:

```text
 1. validate candidate                 Zod + <100-word body rule
 2. load article                       404 if missing
 3. load article chunks                409 if the article has no chunks
 4. embed candidate                    Gemini, 768 dims
 5. calculate relevance                mean cosine over top-K chunks
 6. load existing submissions          same articleId only
 7. cosine candidate vs every comment
 8. raw novelty                        1 - weighted top-K similarity
 9. calibrated novelty                 percentile vs leave-one-out distribution
10. apply relevance gate               reward = passed ? normalized : 0
11. persist submission + evaluation
12. return the full breakdown
```

The candidate is scored against the corpus **before** it is inserted, and the
similarity list is computed from that pre-insert snapshot — a comment is never
compared against itself.

Request:

```json
POST /api/articles/:articleId/evaluate
{
  "headline": "Microplastics found in the deepest ocean trenches",
  "body": "Sediment cores from the hadal zone contain synthetic polymer fragments, confirming marine plastic debris reaches the deepest ocean trenches.",
  "stance": "support"
}
```

Response:

```json
{
  "data": {
    "candidate": { "headline": "...", "body": "...", "stance": "support" },
    "relevance": { "score": 0.876, "threshold": 0.72, "passed": true },
    "novelty":   { "raw": 0.088, "normalized": 0.0 },
    "reward": 0.0,
    "neighbors": [
      { "submissionId": "…", "similarity": 0.912, "headline": "…" }
    ]
  }
}
```

---

## Relevance algorithm

> How strongly does the candidate relate to the article?

The candidate is embedded once, then compared to each article chunk with cosine
similarity. The top `RELEVANCE_TOP_K` (= 3) similarities are averaged:

```text
chunkSims   = [cosine(candidate, chunk_i) for each chunk]
topK        = sorted(chunkSims, desc)[:3]
relevance   = clamp01(mean(topK))
```

If the article produced fewer chunks than K, all available chunks are used. With
one chunk (short articles) this reduces to a single cosine — which is exactly the
intended behaviour.

`relevancePassed = relevance >= RELEVANCE_THRESHOLD`.

Article chunking (`services/chunking.ts`) is deterministic and sentence-aware: it
splits on `.`/`?`/`!` boundaries and accumulates sentences up to
`MAX_WORDS_PER_CHUNK` (default 400 words), never cutting mid-sentence. Short
articles become a single chunk.

---

## Novelty algorithm

> How different is this candidate from the comments already written?

Cosine similarity between the candidate and every existing comment for the same
article is computed exactly in TypeScript (transparent, no approximate index).
Similarities are sorted descending and blended with fixed weights:

```text
similarity_1 >= similarity_2 >= ... >= similarity_n

local_similarity = 0.40*similarity_1
                 + 0.25*similarity_2
                 + 0.15*similarity_3
                 + 0.12*similarity_4
                 + 0.08*similarity_5

raw_novelty = clamp01(1 - local_similarity)
```

Only the 5 nearest comments matter — a comment that duplicates one idea is not
diluted by 45 unrelated ones. `NOVELTY_WEIGHTS` must sum to 1 and is validated on
load.

The novelty representation deliberately **excludes stance**:

```text
Headline: <headline>
Body: <body>
```

so two comments expressing the same idea from opposite stances are not treated as
novel merely because the stance word differs.

---

## Novelty calibration

Raw embedding distance is model- and distribution-dependent, so `raw_novelty` is
not interpretable on its own. It is converted to an empirical percentile against
the corpus itself, using **leave-one-out**:

```text
for each existing comment i:
    D[i] = raw novelty of i compared against every comment except i

normalizedNovelty = count(D[j] <= raw_novelty) / len(D)      clamped to [0,1]
```

A value of `0.90` means "more novel than ~90% of the existing population". It is
**not** a probability of originality.

This distribution is `O(n²)` cosine work, so it is memoised in-process — but keyed
by `(articleId, corpus size)` so it is recomputed whenever the corpus grows.
`resetNoveltyCache()` clears it.

---

## Reward rule

```ts
reward = relevancePassed ? normalizedNovelty : 0;
```

Clamped to `[0, 1]`; never `NaN`, `Infinity`, negative, or above 1. The gate is
hard and intentional: a novel but irrelevant comment scores exactly zero.

---

## API reference

Base URL when running locally: `http://localhost:3001`. The web server proxies
`/api/*` to the API, so the browser only ever talks to one origin and needs no
CORS.

All responses are JSON. Success uses `{ "data": ... }`. Errors use
`{ "error": "message", "details"?: ... }`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness + whether the DB is configured |
| `GET` | `/api/articles` | Articles with `submissionCount` / `evaluationCount` |
| `POST` | `/api/articles` | Create an article; chunks and embeds it |
| `GET` | `/api/articles/:articleId` | One article with full content |
| `GET` | `/api/articles/:articleId/submissions` | Corpus for an article |
| `POST` | `/api/articles/:articleId/submissions` | Add a comment without scoring it |
| `POST` | `/api/articles/:articleId/evaluate` | **Score a candidate** and persist the result |
| `GET` | `/api/articles/:articleId/evaluations` | Evaluation history, newest first, joined with its candidate |
| `GET` | `/api/evaluations/:evaluationId` | One evaluation |

Route helpers are shared from `packages/shared` as `apiRoutes.*` so the frontend
never hand-builds URLs.

### Status codes

| Code | When |
|---|---|
| `200` | Success |
| `201` | Article or submission created (`Location` header set) |
| `204` | CORS preflight |
| `400` | Validation failure — bad stance, missing/oversized field, malformed JSON, invalid UUID |
| `404` | Article or evaluation not found, unknown route |
| `409` | Article exists but has no chunks to score against |
| `503` | `PG_URI` not configured (DB-backed routes) |
| `502` | Web server could not reach the API (proxy) |
| `500` | Unexpected server error (details logged server-side, never returned) |

Zod failures are translated to `400` centrally in `lib/http.ts`, so a schema
violation is a client error rather than a `500`.

### Try it

```bash
# health
curl -s http://localhost:3001/api/health

# list articles
curl -s http://localhost:3001/api/articles

# score a relevant, novel comment
curl -s -X POST \
  http://localhost:3001/api/articles/<ARTICLE_ID>/evaluate \
  -H 'content-type: application/json' \
  -d '{
    "headline": "Sediment cores can date the pollution onset",
    "body": "Dating microplastic layers in dated sediment cores could establish when synthetic debris first reached the basin.",
    "stance": "support"
  }'

# score an irrelevant comment — expect reward 0
curl -s -X POST \
  http://localhost:3001/api/articles/<ARTICLE_ID>/evaluate \
  -H 'content-type: application/json' \
  -d '{
    "headline": "City council approves eight new bike lanes",
    "body": "The council voted to build protected cycling corridors along four arterial roads.",
    "stance": "support"
  }'
```

---

## Frontend

React 19 + TanStack Query + shadcn/ui, served by `Bun.serve` with HTML imports
(no bundler config, no Vite). `Bun.serve` bundles `index.html` → `frontend.tsx` →
`App.tsx` → CSS on the fly, with HMR in development.

### Routes

| Route | Screen |
|---|---|
| `/` | Article list — card per article with excerpt, comment count, evaluation count |
| `/articles/:id` | Article detail — full content, scoring form, live result, history |

Client-side navigation uses the History API with a `popstate` listener; the Bun
server falls back unmatched paths to `index.html` so deep links work on refresh.

### Article detail screen

- **Full article content**, split on blank lines, any length.
- **Corpus badges** — comment and evaluation counts.
- **Scoring form** — headline, body (with live word counter against the 100-word
  limit), stance select, submit button with a pending state and double-submit
  protection.
- **Latest score panel** (sticky on desktop) — appears as soon as a score returns:
  - reward as the hero number,
  - relevance bar with the gate marker drawn on the track,
  - calibrated and raw novelty bars,
  - nearest neighbours with similarities, explaining *why*.
- **Evaluation history** — collapsible rows of past scores for the article.

### UI states handled

Loading skeletons with stable heights (no layout jump), empty states with a
pointed hint (e.g. run `bun run db:seed`), API-unreachable state, validation
errors inline, and a dismissible toast for success/failure.

### Styling

Tailwind v4 with shadcn/ui design tokens in `apps/web/styles/globals.css`. Motion
is intentionally restrained — meters fill without per-card entrance animations —
and everything animated is disabled under `prefers-reduced-motion`.

---

## Seed dataset

`bun run db:seed` builds a deterministic, labelled demo corpus from
`apps/api/src/db/seedData.ts`.

- **One article** — "Ocean Plastic Pollution", ~330 words of news-style prose.
- **50 comments**, each with headline, body (<100 words) and stance, in six
  controlled categories:

| Category | Count | Expected behaviour |
|---|---|---|
| Relevant + repetitive | 10 | high relevance, low novelty |
| Relevant + medium novelty | 10 | high relevance, mid novelty |
| Relevant + high novelty | 10 | high relevance, high novelty |
| Irrelevant + high novelty | 10 | **low relevance → reward 0** |
| Irrelevant + repetitive | 5 | low relevance, low novelty |
| Borderline relevance | 5 | near the gate |

- **Real Gemini embeddings** for the article chunks and every comment. Batched
  with bounded concurrency (`GEMINI_BATCH_SIZE`, `GEMINI_MAX_CONCURRENCY`).
- **Stable IDs** derived from the index, so re-running upserts rather than
  duplicating. Stale rows from an older dataset are removed.
- **Safe to rerun** — it only touches its own fixed-ID rows and never deletes
  unrelated data.

Golden labels live alongside the data for the metrics runner. They are **never**
read by the scoring algorithm.

---

## Evaluation runner and metrics

```bash
bun run evaluate
```

Runs two things and prints computed (never fabricated) results.

**Behavioural probes** — the six cases the product must demonstrate:

| Probe | Expected |
|---|---|
| A — near-duplicate of a corpus comment | low novelty |
| B — paraphrase (same idea, different words) | low novelty |
| C — relevant, genuinely new idea | high relevance, high reward |
| D — irrelevant but highly novel | low relevance, **reward 0** |
| E — relevant but repetitive | high relevance, low reward |
| F — unusual wording, same idea | low novelty |

**Labelled corpus sweep** — scores all 50 seeded comments and reports:

```text
candidates scored       : 50
relevance accuracy      : 1.000 (45/45)
irrelevant reward rate  : 0.000 (0/15)
mean reward             : 0.252
reward bound violations : 0
```

`irrelevant reward rate` is the headline number: irrelevant comments receiving
reward > 0. The target is 0. `reward bound violations` must always be 0.

Because scoring persists each candidate (the evaluation row references a stored
submission), the runner first removes rows left by previous runs so the corpus
stays at 50 and the metrics stay reproducible.

---

## Testing

```bash
bun test
```

25 tests, no network access required — the math is tested with deterministic
vectors rather than live Gemini calls.

| File | Covers |
|---|---|
| `apps/api/test/similarity.test.ts` | `cosineSimilarity`, `clamp01`, `weightedTopKSimilarity`, `calculateRawNovelty`, `percentile`, `rankSimilarities` |
| `apps/api/test/validation.test.ts` | stance validation, the 100-word rule, article validation |
| `apps/api/test/evaluation.test.ts` | calibration-cache reset behaviour |

Covered behaviours include: identical vectors → similarity 1, orthogonal → 0,
dimension mismatch rejected, empty vectors rejected, zero vectors handled, and
the word-count boundary at exactly 99 vs 100 words.

Typechecking covers the root scripts as well as every workspace:

```bash
bun run typecheck
# tsc -p tsconfig.scripts.json  →  scripts/run-local.ts
# then each workspace's own tsc
```

---

## Local Postgres bootstrap

`bun run run-local` never assumes you have a database running. At step 2 it reads
`PG_URI` from `apps/api/.env` and probes it with `SELECT 1`:

- **Reachable** (PlanetScale or local) → proceeds silently, no prompts.
- **Missing, or a local server that is down** → offers to start one:
  - Docker available → asks for confirmation, then creates or reuses a container
    `novel-relevancy-postgres` from `pgvector/pgvector:pg16` on port 5432, waits
    until it accepts connections, and offers to save the URI to the gitignored
    `.env`.
  - Docker unavailable → prints install guidance and accepts a pasted `PG_URI`, or
    quits with instructions.
- **Configured but remote and unreachable** → fails immediately with a clear
  message, because the local Docker fallback only makes sense for `localhost`.

It also verifies `GEMINI_API_KEY` is present before seeding, since embeddings are
required.

Managing the local container:

```bash
docker stop novel-relevancy-postgres      # stop
docker start novel-relevancy-postgres     # restart
docker logs novel-relevancy-postgres      # inspect
docker rm -f novel-relevancy-postgres    # delete (run-local recreates it)
```

---

## Troubleshooting

**`PG_URI … is not reachable`** — the credentials or network are wrong, or the
branch is asleep. For PlanetScale, confirm the host resolves
(`dig <host>`), that port 5432 is open, and that you are using a password or
API-token URI with DDL permission.

**`unrecognized configuration parameter "sslrootcert"`** — you are connecting
through code that does not go through `apps/api/src/env.ts`. Load the env file
(`bun --env-file=apps/api/.env …`) so the URI is normalized.

**`permission denied for schema public` on migrate** — the database role cannot
run DDL. PlanetScope creates a separate `pscale_api_*` role per API token; most are
data-only (`pg_read_all_data` / `pg_write_all_data`, no `CREATE`). Use a branch
password connection, or apply the schema once through the PlanetScale CLI/dashboard
and let the app only do DML.

**`remaining connection slots are reserved for roles with the SUPERUSER attribute`**
— the connection pool is exhausted. The app caps its pool (`PG_POOL_MAX`, default
5) and disposes of pools on `--hot` reload; if you hit this, something else is
holding connections against the same database.

**`Gemini returned an empty embedding`** — the API key is invalid, quota is
exhausted, or the request was throttled. Verify the key and retry.

**`409 Article has no chunks`** — the article row exists but chunking failed when
it was created. Recreate the article, or re-run `bun run db:seed` for the demo one.

**UI says "API unreachable"** — the API is not running. Start it with
`bun run run-local`, or check that `API_ORIGIN` in `apps/web` points at the right
API port.

**`bun run db:seed` re-embeds everything** — embeddings are only reused for rows
that already exist. Deleting rows forces re-embedding, which consumes Gemini quota.

---

## Design decisions

**One embedding per comment, never chunked.** A comment is under 100 words and is
a single semantic unit. Splitting it would compare fragments instead of ideas.

**Stance is excluded from the novelty text.** Two comments making the same argument
from opposite sides are not novel relative to each other; including stance would
inflate novelty for a wording difference.

**Article chunking is dynamic.** Article length is not fixed by the spec, so chunk
count follows content length — one chunk for short articles, sentence-aware
multiple chunks for long ones — without ever cutting mid-sentence.

**Exact cosine in TypeScript, not a vector index.** For ~50 comments, 50 cosine
calculations are trivial. Avoiding approximate nearest-neighbour behaviour keeps
the demo honest and the algorithm transparent. The repository layer
(`findNearestSubmissions`) isolates this so it can move to SQL later.

**Percentile calibration instead of raw distance.** Raw embedding distance depends
on the model and the population. A leave-one-out percentile is interpretable:
"more novel than X% of what already exists".

**Relevance is a hard gate, not a multiplier.** A blended score would let a very
novel irrelevant comment out-score a moderately novel relevant one. The gate makes
that impossible: below threshold the reward is exactly zero.

**The threshold is measured.** 0.72 came from a sweep over the labelled corpus, not
from intuition. The evidence table lives next to the default in `env.ts`.

**Migrations are idempotent and ledger-isolated.** Drizzle's migrator only applies
pending migrations, and its ledger lives in a dedicated `novel_relevancy` schema so
it can coexist with other applications in a shared database.

**The pool is small and hot-reload safe.** PlanetScale caps concurrent connections,
so the pool is capped and disposed on `--hot` reloads.

**UI animations are restrained.** Per-card entrance animations on every list render
read as janky. Meters fill; content does not bounce.

---

## Known limitations

- **Cloudflare Workers cannot run this API as written.** `Bun.serve` and `Bun.SQL`
  (raw TCP) are not available in the Workers runtime. See
  [Deploying to Cloudflare](#deploying-to-cloudflare).
- **Calibrated novelty is compressed** on the demo corpus (values mostly below
  ~0.15) because the 50 seeded comments are topically tight about one article. This
  is expected behaviour for percentile calibration over a narrow population, but it
  makes the demo numbers look small.
- **The calibration cache is per-process.** Multiple API instances each build their
  own leave-one-out distribution. Results stay correct; only the memoisation is
  duplicated.
- **Nearest neighbours are not persisted.** They are derived at scoring time, so
  `GET /evaluations` returns them empty; only the `POST /evaluate` response contains
  them.
- **No authentication.** Every endpoint is open. Fine for a local demo, must be
  addressed before any public deployment.
- **Rate limiting is absent**, so the Gemini key is exposed to abuse if deployed
  publicly.

---

## Deploying to Cloudflare

The frontend deploys to Cloudflare Pages as-is. The API needs a decision.

### Option A — Pages for the web, API elsewhere (minimal work)

1. Build the web app: `bun run --filter '@novel-relevancy/web' build` → `apps/web/dist`.
2. Create a Cloudflare Pages project with that output directory.
3. Deploy the API to any host with Postgres connectivity (a VM, Fly.io, Render,
   Railway) and set `API_ORIGIN` on the Pages project to that URL.

Requires: Cloudflare **Account ID** and a **Pages project name**.

### Option B — Everything on Cloudflare (requires a refactor)

To run the API on Workers it must be rewritten to a `fetch`-style handler
(e.g. Hono) and Postgres must be reached over HTTP rather than TCP, via
**Hyperdrive** (pointing at the existing Postgres/PlanetScale) or by moving data
to **D1**/**Neon**. `Bun.serve` and `Bun.SQL` cannot run in that runtime.

Requires: Cloudflare **Account ID**, an **API token** with Workers + Pages +
Hyperdrive (or D1) permissions, the **Hyperdrive ID** (or permission to create
one), and all runtime secrets (`PG_URI`, `GEMINI_API_KEY`).

### Security before any public deploy

Rotate the database password and the Gemini API key that have been exposed during
development, and put authentication in front of the scoring endpoint.
