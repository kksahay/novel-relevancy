import type { BunRequest } from "bun";
import type { User } from "@novel-relevancy/shared";
import { desc, eq } from "drizzle-orm";
import { requireDb } from "../db/client";
import { users, type UserRow } from "../db/schema";
import {
  asObject,
  EMAIL_PATTERN,
  HttpError,
  isUniqueViolation,
  json,
  parseLimit,
  parseUuid,
  readJson,
  requiredString,
} from "../lib/http";

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listUsers(req: BunRequest<"/api/users">): Promise<Response> {
  const db = requireDb();
  const limit = parseLimit(new URL(req.url).searchParams);

  const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(limit);
  const data = rows.map(toUser);

  return json({ data, count: data.length });
}

export async function createUser(req: BunRequest<"/api/users">): Promise<Response> {
  const db = requireDb();
  const body = asObject(await readJson(req));

  const name = requiredString(body, "name", { max: 120 });
  const email = requiredString(body, "email", { max: 255 }).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, `"email" must be a valid email address`, { field: "email" });
  }

  let rows: UserRow[];
  try {
    rows = await db.insert(users).values({ name, email }).returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "A user with this email already exists", { field: "email" });
    }
    throw error;
  }

  const row = rows[0];
  if (!row) throw new HttpError(500, "User could not be created");

  return json({ data: toUser(row) }, { status: 201, headers: { location: `/api/users/${row.id}` } });
}

export async function getUser(req: BunRequest<"/api/users/:id">): Promise<Response> {
  const db = requireDb();
  const id = parseUuid(req.params.id);

  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, `User ${id} not found`);

  return json({ data: toUser(row) });
}

export async function deleteUser(req: BunRequest<"/api/users/:id">): Promise<Response> {
  const db = requireDb();
  const id = parseUuid(req.params.id);

  const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  if (!rows[0]) throw new HttpError(404, `User ${id} not found`);

  return json({ data: { id } });
}

export const userRoutes = {
  "/api/users": {
    GET: listUsers,
    POST: createUser,
  },
  "/api/users/:id": {
    GET: getUser,
    DELETE: deleteUser,
  },
};
