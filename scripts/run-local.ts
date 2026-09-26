import { join } from "node:path";

const root = join(import.meta.dir, "..");
const apiDir = join(root, "apps/api");
const webDir = join(root, "apps/web");
const apiEnvFile = join(apiDir, ".env");
const apiPort = 3001;
const webPort = 3000;
const healthUrl = `http://localhost:${apiPort}/api/health`;
const webUrl = `http://localhost:${webPort}`;

const LOCAL_CONTAINER = "novel-relevancy-postgres";
const LOCAL_IMAGE = "pgvector/pgvector:pg16";
const LOCAL_PG_URI = "postgres://postgres:postgres@localhost:5432/novel_relevancy";

type Subprocess = ReturnType<typeof Bun.spawn>;

function emit(line: string, label: string, toStderr: boolean): void {
  if (!line) return;
  const text = `[${label}] ${line}`;
  if (toStderr) console.error(text);
  else console.log(text);
}

async function pump(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  label: string,
  toStderr: boolean,
): Promise<void> {
  if (stream === null || stream === undefined || typeof stream === "number") return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) emit(line, label, toStderr);
    }
    pending += decoder.decode();
    emit(pending, label, toStderr);
  } catch {
    pending = "";
  }
}

function spawnBun(dir: string, args: string[], label: string): Subprocess {
  const proc = Bun.spawn(["bun", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  void pump(proc.stdout, label, false);
  void pump(proc.stderr, label, true);
  return proc;
}

function ask(question: string, fallback = ""): string {
  const answer = prompt(question);
  if (answer === null) return fallback;
  const trimmed = answer.trim();
  return trimmed === "" ? fallback : trimmed;
}

function askYesNo(question: string, fallback = false): boolean {
  const answer = ask(`${question} ${fallback ? "[Y/n]" : "[y/N]"} `);
  if (answer === "") return fallback;
  return /^(y|yes)$/i.test(answer);
}

function fail(message: string): never {
  console.error(`\n[FAIL] ${message}`);
  process.exit(1);
}

/** Read a KEY=value pair from a .env file without importing app code. */
async function readEnvFile(path: string, key: string): Promise<string | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  for (const line of (await file.text()).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (match?.[1] === key) {
      let value = (match[2] ?? "").trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return value || undefined;
    }
  }
  return undefined;
}

/** Set (or add) a KEY=value pair in a .env file, preserving everything else. */
async function writeEnvFile(path: string, key: string, value: string): Promise<void> {
  const file = Bun.file(path);
  const lines = (await file.exists()) ? (await file.text()).split("\n") : [];
  let replaced = false;
  const next = lines.map(line => {
    if (/^\s*#/.test(line)) return line;
    const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=.*)$/.exec(line);
    if (match?.[2] === key) {
      replaced = true;
      return `${match[1]}${key}=${value}`;
    }
    return line;
  });
  if (!replaced) {
    if (next.length > 0 && next[next.length - 1]?.trim() !== "") next.push("");
    next.push(`${key}=${value}`);
  }
  await Bun.write(path, next.join("\n"));
}

function isLocalHost(uri: string): boolean {
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  const probe = await Bun.$`command -v ${cmd}`.quiet().nothrow();
  return probe.exitCode === 0;
}

/** Returns true when a Postgres server answers at the given URI. */
async function postgresReachable(uri: string, timeoutMs = 8000): Promise<boolean> {
  let sql: Bun.SQL | undefined;
  try {
    sql = new Bun.SQL(uri, { max: 1, idleTimeout: 2 });
    const result = await Promise.race([
      sql`SELECT 1 AS ok`.then(() => true).catch(() => false),
      Bun.sleep(timeoutMs).then(() => false),
    ]);
    return result;
  } catch {
    return false;
  } finally {
    await sql?.end().catch(() => {});
  }
}

async function dockerAvailable(): Promise<boolean> {
  if (!(await commandExists("docker"))) return false;
  const probe = await Bun.$`docker info`.quiet().nothrow();
  return probe.exitCode === 0;
}

async function containerState(name: string): Promise<"running" | "stopped" | "missing"> {
  const running = await Bun.$`docker ps --filter name=${name} --format {{.Names}}`.quiet().nothrow();
  if (running.exitCode === 0 && running.text().split("\n").some(line => line.trim() === name)) return "running";
  const all = await Bun.$`docker ps -a --filter name=${name} --format {{.Names}}`.quiet().nothrow();
  if (all.exitCode === 0 && all.text().split("\n").some(line => line.trim() === name)) return "stopped";
  return "missing";
}

async function waitForPostgres(uri: string, timeoutMs = 60000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await postgresReachable(uri, 3000)) return true;
    await Bun.sleep(1000);
  }
  return false;
}

async function startLocalPostgres(): Promise<string> {
  console.log("\n[database] Local Postgres is not reachable.");
  console.log("  The demo needs Postgres with the pgvector extension.");
  console.log("  Easiest path: run it in Docker (image: pgvector/pgvector:pg16).");

  if (!(await dockerAvailable())) {
    console.log("\n[database] Docker is not available on this machine.");
    console.log("  Install Docker Desktop (https://www.docker.com/products/docker-desktop),");
    console.log("  or install Postgres 16 + pgvector manually and make sure it listens on localhost:5432.");
    const uri = ask("  Paste a PG_URI to use instead (empty to quit): ");
    if (!uri) fail("No database configured. Add PG_URI to apps/api/.env and re-run.");
    if (!(await postgresReachable(uri))) fail("That PG_URI is not reachable. Check the value and re-run.");
    return uri;
  }

  if (!askYesNo("  Start a local Postgres container now?", true)) {
    const uri = ask("  Paste a PG_URI to use instead (empty to quit): ");
    if (!uri) fail("No database configured. Add PG_URI to apps/api/.env and re-run.");
    if (!(await postgresReachable(uri))) fail("That PG_URI is not reachable. Check the value and re-run.");
    return uri;
  }

  const state = await containerState(LOCAL_CONTAINER);
  if (state === "running") {
    console.log(`[database] Container "${LOCAL_CONTAINER}" is already running.`);
  } else if (state === "stopped") {
    console.log(`[database] Starting existing container "${LOCAL_CONTAINER}"...`);
    const started = await Bun.$`docker start ${LOCAL_CONTAINER}`.quiet().nothrow();
    if (started.exitCode !== 0) fail(`Could not start container "${LOCAL_CONTAINER}". Run \`docker start ${LOCAL_CONTAINER}\` manually to see why.`);
  } else {
    console.log(`[database] Creating container "${LOCAL_CONTAINER}" (${LOCAL_IMAGE})...`);
    const created = await Bun.$`docker run -d --name ${LOCAL_CONTAINER} -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=novel_relevancy -p 5432:5432 ${LOCAL_IMAGE}`.nothrow();
    if (created.exitCode !== 0) {
      fail(`Could not create the Postgres container. ${created.stderr.toString().trim() || "Check that port 5432 is free and Docker can pull images."}`);
    }
  }

  console.log("[database] Waiting for Postgres to accept connections...");
  if (!(await waitForPostgres(LOCAL_PG_URI))) {
    fail(`Postgres did not become ready. Check \`docker logs ${LOCAL_CONTAINER}\` and re-run.`);
  }
  console.log("[database] Local Postgres is up.");
  return LOCAL_PG_URI;
}

/**
 * Resolve the database to use:
 * - a reachable PG_URI from apps/api/.env wins (PlanetScale or local);
 * - a missing/unreachable one triggers the local-Postgres bootstrap above;
 * - a reachable remote is never touched beyond a SELECT 1 probe.
 */
async function ensurePostgres(): Promise<string> {
  const configured = await readEnvFile(apiEnvFile, "PG_URI");

  if (configured) {
    console.log("[2/5] Checking database connection...");
    if (await postgresReachable(configured)) {
      console.log("[2/5] Database is reachable.");
      return configured;
    }
    if (!isLocalHost(configured)) {
      fail(
        "PG_URI in apps/api/.env points at a remote database that is not reachable. " +
          "Check the credentials / network and re-run. (Local bootstrap only applies to localhost.)",
      );
    }
    console.log("[2/5] The configured localhost Postgres is not running.");
  } else {
    console.log("[2/5] No PG_URI found in apps/api/.env.");
  }

  const uri = await startLocalPostgres();
  const persist = uri === LOCAL_PG_URI || askYesNo("  Save this PG_URI to apps/api/.env?", true);
  if (persist) {
    await writeEnvFile(apiEnvFile, "PG_URI", uri);
    console.log("[2/5] Saved PG_URI to apps/api/.env (gitignored).");
  }
  return uri;
}

async function waitForReady(url: string, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`[${label}] ready at ${url}`);
        return;
      }
    } catch {
      await Bun.sleep(250);
      continue;
    }
    await Bun.sleep(250);
  }
  throw new Error(`${label} did not become ready at ${url} within ${timeoutMs}ms`);
}

async function runStep(dir: string, args: string[], label: string): Promise<number> {
  console.log(`\n=== ${label} ===`);
  return spawnBun(dir, args, label).exited;
}

async function main(): Promise<void> {
  const probe = await Bun.$`test -d ${join(root, "node_modules")}`.quiet().nothrow();
  if (probe.exitCode === 0) {
    console.log("[1/5] Dependencies already installed.");
  } else {
    console.log("[1/5] Installing dependencies...");
    await Bun.$`bun install`.cwd(root);
  }

  const pgUri = await ensurePostgres();
  void pgUri;

  const geminiKey = await readEnvFile(apiEnvFile, "GEMINI_API_KEY");
  if (!geminiKey) {
    fail(
      "GEMINI_API_KEY is missing from apps/api/.env. Seeding and scoring need embeddings. " +
        "Get a key from Google AI Studio, add GEMINI_API_KEY=<key> to apps/api/.env, and re-run.",
    );
  }

  console.log("\n[3/5] Applying migrations...");
  const migrateCode = await runStep(apiDir, ["run", "db:migrate"], "migrate");
  if (migrateCode !== 0) {
    fail(`db:migrate exited with code ${migrateCode}. Fix the database errors above.`);
  }

  console.log("\n[4/5] Seeding...");
  const seedCode = await runStep(apiDir, ["run", "db:seed"], "seed");
  if (seedCode !== 0) {
    fail(`db:seed exited with code ${seedCode}. Fix the errors above.`);
  }

  console.log("\n[5/5] Starting servers...");
  const api = spawnBun(apiDir, ["run", "dev"], "api");
  let web: Subprocess | undefined;

  const shutdown = (): void => {
    api.kill("SIGTERM");
    web?.kill("SIGTERM");
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  try {
    await waitForReady(healthUrl, "api");
    web = spawnBun(webDir, ["run", "dev"], "web");
    await waitForReady(webUrl, "web");
  } catch (error) {
    shutdown();
    fail((error as Error).message);
  }

  console.log(`\nAPI  ${healthUrl}`);
  console.log(`WEB  ${webUrl}`);
  console.log("\nPress Ctrl+C to stop both servers.");

  const first = await Promise.race([
    api.exited.then((code) => ({ label: "api", code })),
    (web?.exited ?? Promise.resolve(0)).then((code) => ({ label: "web", code })),
  ]);
  shutdown();
  fail(`${first.label} exited unexpectedly with code ${first.code}`);
}

await main();
