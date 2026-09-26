import { desc, eq } from "drizzle-orm";
import { db, requireDb } from "../db/client";
import { submissions } from "../db/schema";

export async function getSubmissions(articleId: string) {
  const database = requireDb();
  return database.select().from(submissions).where(eq(submissions.articleId, articleId)).orderBy(desc(submissions.createdAt));
}

export async function getSubmission(id: string) {
  const database = requireDb();
  const [row] = await database.select().from(submissions).where(eq(submissions.id, id)).limit(1);
  return row ?? undefined;
}

export async function createSubmission(data: {
  articleId: string;
  headline: string;
  body: string;
  stance: string;
  embedding: number[];
}) {
  const database = requireDb();
  const [row] = await database.insert(submissions).values(data).returning();
  return row;
}

export async function findNearestSubmissions(
  articleId: string,
  embedding: number[],
  limit: number,
  excludeCandidateId?: string,
) {
  const database = requireDb();
  const rows = await database
    .select()
    .from(submissions)
    .where(eq(submissions.articleId, articleId))
    .limit(limit * 3); // fetch more, filter in TS for exact scoring

  return rows.filter(r => r.embedding && r.id !== excludeCandidateId);
}

export type SubmissionRow = typeof submissions.$inferSelect;
