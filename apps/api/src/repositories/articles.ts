import { countDistinct, eq } from "drizzle-orm";
import { requireDb } from "../db/client";
import { articleChunks, articles, evaluations, submissions } from "../db/schema";

export async function getArticle(id: string) {
  const database = requireDb();
  const [row] = await database.select().from(articles).where(eq(articles.id, id)).limit(1);
  return row ?? undefined;
}

/** Articles with their corpus size, newest first, so the UI can show coverage. */
export async function getArticles() {
  const database = requireDb();
  return database
    .select({
      id: articles.id,
      title: articles.title,
      content: articles.content,
      createdAt: articles.createdAt,
      // Both sides join to `articles`, so distinct counts are required to avoid
      // the cartesian product of submissions x evaluations.
      submissionCount: countDistinct(submissions.id),
      evaluationCount: countDistinct(evaluations.id),
    })
    .from(articles)
    .leftJoin(submissions, eq(submissions.articleId, articles.id))
    .leftJoin(evaluations, eq(evaluations.articleId, articles.id))
    .groupBy(articles.id)
    .orderBy(articles.createdAt);
}

export async function createArticle(data: { title: string; content: string }) {
  const database = requireDb();
  const [row] = await database.insert(articles).values(data).returning();
  return row;
}

export async function getArticleChunks(articleId: string) {
  const database = requireDb();
  return database.select().from(articleChunks).where(eq(articleChunks.articleId, articleId)).orderBy(articleChunks.chunkIndex);
}

export async function upsertArticleChunks(
  articleId: string,
  chunks: Array<{ chunkIndex: number; content: string; embedding: number[] }>,
) {
  const database = requireDb();
  for (const chunk of chunks) {
    await database
      .insert(articleChunks)
      .values({
        articleId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding,
      })
      .onConflictDoUpdate({
        target: [articleChunks.articleId, articleChunks.chunkIndex],
        set: { content: chunk.content, embedding: chunk.embedding },
      });
  }
}
