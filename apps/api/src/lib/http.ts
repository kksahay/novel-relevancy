import { logger } from "./logger";

/** Error that maps directly onto an HTTP status code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function notFound(): Response {
  return json({ error: "Not Found" }, { status: 404 });
}

/** Converts any thrown value into a JSON error response. */
export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    const body = error.details === undefined ? { error: error.message } : { error: error.message, details: error.details };
    return json(body, { status: error.status });
  }

  logger.error("unhandled error:", error);
  return json({ error: "Internal Server Error" }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  body: Record<string, unknown>,
  field: string,
  options: { max?: number } = {},
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `"${field}" is required and must be a non-empty string`, { field });
  }

  const trimmed = value.trim();
  const max = options.max ?? 500;
  if (trimmed.length > max) {
    throw new HttpError(400, `"${field}" must be at most ${max} characters`, { field, max });
  }
  return trimmed;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuid(raw: string | undefined, field = "id"): string {
  if (!raw || !UUID_PATTERN.test(raw)) {
    throw new HttpError(400, `"${field}" must be a valid UUID`, { field });
  }
  return raw;
}

export function parseLimit(searchParams: URLSearchParams, fallback = 50, max = 100): number {
  const raw = searchParams.get("limit");
  if (raw === null) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new HttpError(400, `limit must be an integer between 1 and ${max}`, { field: "limit" });
  }
  return value;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Detects a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "23505") return true;

  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause?: unknown }).cause : undefined;
  return /duplicate key value|unique constraint/i.test(`${String(error)} ${String(cause)}`);
}
