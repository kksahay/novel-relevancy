import { eq } from "drizzle-orm";
import { requireDb } from "./client";
import { articleChunks, articles, submissions } from "./schema";
import {
  SEED_ARTICLE_CONTENT,
  SEED_ARTICLE_TITLE,
  SEED_SUBMISSIONS,
  type SeedSubmission,
} from "./seedData";
import { chunkArticle } from "../services/chunking";
import { embeddingService } from "../services/embedding";

export const SEED_ARTICLE_ID = "a1a1a1a1-0000-4000-8000-000000000001";

/** Stable ids so re-running the seed updates rows instead of duplicating them. */
function submissionId(index: number): string {
  return `a1a1a1a1-0000-4000-8000-${String(index + 2).padStart(12, "0")}`;
}

function noveltyText(row: Pick<SeedSubmission, "headline" | "body">): string {
  return `Headline: ${row.headline}\nBody: ${row.body}`;
}

export async function seedDatabase(): Promise<void> {
  const database = requireDb();

  await database
    .insert(articles)
    .values({ id: SEED_ARTICLE_ID, title: SEED_ARTICLE_TITLE, content: SEED_ARTICLE_CONTENT })
    .onConflictDoUpdate({
      target: articles.id,
      set: { title: SEED_ARTICLE_TITLE, content: SEED_ARTICLE_CONTENT },
    });

  const chunks = chunkArticle(SEED_ARTICLE_CONTENT);
  const chunkEmbeddings = await embeddingService.embedMany(chunks);

  // Chunks are derived purely from the article text, so replacing them keeps
  // them in sync with the content and stays idempotent.
  await database.delete(articleChunks).where(eq(articleChunks.articleId, SEED_ARTICLE_ID));
  await database.insert(articleChunks).values(
    chunks.map((content, chunkIndex) => ({
      articleId: SEED_ARTICLE_ID,
      chunkIndex,
      content,
      embedding: chunkEmbeddings[chunkIndex]!,
    })),
  );

  const existing = await database
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.articleId, SEED_ARTICLE_ID));
  const existingIds = new Set(existing.map(row => row.id));

  const planned = SEED_SUBMISSIONS.map((row, index) => ({
    id: submissionId(index),
    articleId: SEED_ARTICLE_ID,
    headline: row.headline,
    body: row.body,
    stance: row.stance,
  }));

  const missing = planned.filter(row => !existingIds.has(row.id));
  if (missing.length > 0) {
    const embeddings = await embeddingService.embedMany(missing.map(noveltyText));
    await database.insert(submissions).values(
      missing.map((row, i) => ({ ...row, embedding: embeddings[i]! })),
    );
  }

  // Drop any stale rows left over from an older, differently sized dataset.
  const plannedIds = new Set(planned.map(row => row.id));
  const stale = [...existingIds].filter(id => !plannedIds.has(id));
  if (stale.length > 0) {
    for (const id of stale) {
      await database.delete(submissions).where(eq(submissions.id, id));
    }
  }

  const stored = await database
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.articleId, SEED_ARTICLE_ID));

  const counts = SEED_SUBMISSIONS.reduce<Record<string, number>>((acc, row) => {
    acc[row.relevance] = (acc[row.relevance] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Seed ready: "${SEED_ARTICLE_TITLE}"`);
  console.log(`  article chunks : ${chunks.length}`);
  console.log(`  comments       : ${stored.length} (${missing.length} newly embedded, ${stale.length} stale removed)`);
  console.log(`  labelled       : ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

if (import.meta.main) {
  try {
    await seedDatabase();
  } catch (error) {
    console.error(`[FAIL] Seed failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
