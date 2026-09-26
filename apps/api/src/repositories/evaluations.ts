import { desc, eq } from "drizzle-orm";
import { requireDb } from "../db/client";
import { evaluations, submissions } from "../db/schema";

export async function createEvaluation(data: {
  articleId: string;
  candidateSubmissionId: string;
  relevanceScore: number;
  relevanceThreshold: number;
  relevancePassed: boolean;
  rawNovelty: number;
  normalizedNovelty: number;
  rewardScore: number;
}) {
  const database = requireDb();
  const [row] = await database.insert(evaluations).values(data).returning();
  return row;
}

/**
 * Evaluations joined with the submission they scored, so a client can render a
 * result row without a second round-trip. `neighbors` is not persisted (it is
 * derived at scoring time) and is therefore returned as an empty list.
 */
export async function getEvaluations(articleId: string) {
  const database = requireDb();
  const rows = await database
    .select({
      id: evaluations.id,
      articleId: evaluations.articleId,
      candidateSubmissionId: evaluations.candidateSubmissionId,
      relevanceScore: evaluations.relevanceScore,
      relevanceThreshold: evaluations.relevanceThreshold,
      relevancePassed: evaluations.relevancePassed,
      rawNovelty: evaluations.rawNovelty,
      normalizedNovelty: evaluations.normalizedNovelty,
      rewardScore: evaluations.rewardScore,
      createdAt: evaluations.createdAt,
      candidateHeadline: submissions.headline,
      candidateBody: submissions.body,
      candidateStance: submissions.stance,
    })
    .from(evaluations)
    .innerJoin(submissions, eq(evaluations.candidateSubmissionId, submissions.id))
    .where(eq(evaluations.articleId, articleId))
    .orderBy(desc(evaluations.createdAt));

  return rows.map(row => ({
    id: row.id,
    articleId: row.articleId,
    candidateSubmissionId: row.candidateSubmissionId,
    relevanceScore: row.relevanceScore,
    relevanceThreshold: row.relevanceThreshold,
    relevancePassed: row.relevancePassed,
    rawNovelty: row.rawNovelty,
    normalizedNovelty: row.normalizedNovelty,
    rewardScore: row.rewardScore,
    createdAt: row.createdAt,
    candidate: {
      headline: row.candidateHeadline,
      body: row.candidateBody,
      stance: row.candidateStance,
    },
    neighbors: [] as Array<{ submissionId: string; similarity: number; headline: string }>,
  }));
}

export async function getEvaluation(id: string) {
  const database = requireDb();
  const [row] = await database.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
  return row ?? undefined;
}

export type EvaluationRow = typeof evaluations.$inferSelect;
