import type { BunRequest } from "bun";
import type { PostWithAuthor } from "@novel-relevancy/shared";
import { desc, eq } from "drizzle-orm";
import { requireDb, type Database } from "../db/client";
import { posts, users } from "../db/schema";
import {
  asObject,
  HttpError,
  json,
  parseLimit,
  parseUuid,
  readJson,
  requiredString,
} from "../lib/http";

interface PostWithAuthorRow {
  id: string;
  authorId: string;
  title: string;
  content: string;
  createdAt: Date;
  authorName: string;
}

function toPost(row: PostWithAuthorRow): PostWithAuthor {
  return {
    id: row.id,
    authorId: row.authorId,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    author: { id: row.authorId, name: row.authorName },
  };
}

function postQuery(db: Database) {
  return db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      title: posts.title,
      content: posts.content,
      createdAt: posts.createdAt,
      authorName: users.name,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id));
}

export async function listPosts(req: BunRequest<"/api/posts">): Promise<Response> {
  const db = requireDb();
  const limit = parseLimit(new URL(req.url).searchParams);

  const rows = await postQuery(db).orderBy(desc(posts.createdAt)).limit(limit);
  const data = rows.map(toPost);

  return json({ data, count: data.length });
}

export async function getPost(req: BunRequest<"/api/posts/:id">): Promise<Response> {
  const db = requireDb();
  const id = parseUuid(req.params.id);

  const rows = await postQuery(db).where(eq(posts.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, `Post ${id} not found`);

  return json({ data: toPost(row) });
}

export async function createPost(req: BunRequest<"/api/posts">): Promise<Response> {
  const db = requireDb();
  const body = asObject(await readJson(req));

  const authorId = parseUuid(requiredString(body, "authorId"), "authorId");
  const title = requiredString(body, "title", { max: 200 });
  const content = requiredString(body, "content", { max: 5000 });

  const authors = await db.select({ id: users.id }).from(users).where(eq(users.id, authorId)).limit(1);
  if (!authors[0]) {
    throw new HttpError(400, `"authorId" does not reference an existing user`, { field: "authorId" });
  }

  const rows = await db
    .insert(posts)
    .values({ authorId, title, content })
    .returning({ id: posts.id });

  const row = rows[0];
  if (!row) throw new HttpError(500, "Post could not be created");

  return json({ data: { id: row.id } }, { status: 201, headers: { location: `/api/posts/${row.id}` } });
}

export const postRoutes = {
  "/api/posts": {
    GET: listPosts,
    POST: createPost,
  },
  "/api/posts/:id": {
    GET: getPost,
  },
};
