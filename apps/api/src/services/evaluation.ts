import { embeddingService } from "./embedding";
import { chunkArticle, buildNoveltyRepresentation } from "./chunking";
import { cosineSimilarity, weightedTopKSimilarity, calculateRawNovelty, percentile, rankSimilarities, clamp01 } from "../lib/similarity";
import { HttpError } from "../lib/http";
import { validateSubmission } from "../lib/validation";
import { env } from "../env";
import type { Stance } from "../lib/validation";
import * as articleRepo from "../repositories/articles";
import * as submissionRepo from "../repositories/submissions";
import * as evaluationRepo from "../repositories/evaluations";

/**
 * In-memory calibration distribution cache, keyed by article and corpus size.
 *
 * The leave-one-out distribution is O(n^2) cosine work, so it is memoised, but
 * it must be invalidated whenever the corpus grows or the cached percentile
 * stops describing the population it claims to calibrate against.
 */
const noveltyCache = new Map<string, { size: number; distribution: number[] }>();

export interface EvaluateResult {
  candidate: { headline: string; body: string; stance: Stance };
  relevance: { score: number; threshold: number; passed: boolean };
  novelty: { raw: number; normalized: number };
  reward: number;
  neighbors: Array<{ submissionId: string; similarity: number; headline: string }>;
}

export async function evaluateCandidate(input: {
  articleId: string;
  headline: string;
  body: string;
  stance: Stance;
}): Promise<EvaluateResult> {
  validateSubmission(input);

  const article = await articleRepo.getArticle(input.articleId);
  if (!article) throw new HttpError(404, "Article not found");

  const chunks = await articleRepo.getArticleChunks(input.articleId);
  if (chunks.length === 0) throw new HttpError(409, "Article has no chunks");

  const candidateEmbedding = await embeddingService.embedText(
    buildNoveltyRepresentation(input.headline, input.body),
  );

  // 4. Relevance: cosine against top-K chunks
  const chunkSimilarities = chunks.map(c =>
    c.embedding ? cosineSimilarity(candidateEmbedding, c.embedding) : 0,
  );
  const topK = env.relevanceTopK;
  const topChunkSims = chunkSimilarities.sort((a, b) => b - a).slice(0, topK);
  const avgRelevance = topChunkSims.reduce((s, v) => s + v, 0) / topChunkSims.length;
  const relevanceScore = clamp01(avgRelevance);
  const relevanceThreshold = env.relevanceThreshold;
  const relevancePassed = relevanceScore >= relevanceThreshold;

  // 6. Load existing submissions
  const existing = await submissionRepo.getSubmissions(input.articleId);
  const existingEmbeddings = existing.filter(s => s.embedding && s.embedding.length > 0);

  // 7. Candidate vs each existing submission
  const similarities = existingEmbeddings.map(s => ({
    id: s.id,
    headline: s.headline,
    similarity: cosineSimilarity(candidateEmbedding, s.embedding!),
  }));

  const ranked = rankSimilarities(similarities.map(x => x.similarity));
  const rawNovelty = calculateRawNovelty(
    similarities.map(x => x.similarity),
    env.noveltyWeights,
  );

  // 8. Calibration: leave-one-out over the existing corpus
  let cached = noveltyCache.get(input.articleId);
  if (!cached || cached.size !== existingEmbeddings.length) {
    const distribution = existingEmbeddings.map((_, i) => {
      const others = existingEmbeddings.filter((_, j) => j !== i);
      if (others.length < 2) return 0;
      const leaveOutSims = others.map(o => cosineSimilarity(existingEmbeddings[i]!.embedding!, o.embedding!));
      return calculateRawNovelty(leaveOutSims, env.noveltyWeights);
    });
    cached = { size: existingEmbeddings.length, distribution };
    noveltyCache.set(input.articleId, cached);
  }
  const normalizedNovelty = percentile(cached.distribution, rawNovelty);

  // 10. Apply relevance gate
  const rewardScore = relevancePassed ? normalizedNovelty : 0;

  // 11. Persist evaluation (candidate must be persisted first)
  const created = await submissionRepo.createSubmission({
    articleId: input.articleId,
    headline: input.headline,
    body: input.body,
    stance: input.stance as "support" | "oppose" | "mixed",
    embedding: candidateEmbedding,
  });
  if (!created) throw new HttpError(500, "Failed to create submission");

  const evalRow = await evaluationRepo.createEvaluation({
    articleId: input.articleId,
    candidateSubmissionId: created.id,
    relevanceScore,
    relevanceThreshold,
    relevancePassed,
    rawNovelty,
    normalizedNovelty,
    rewardScore,
  });

  // Neighbors (rankSimilarities returns indices into the similarities array)
  const topNeighbors = rankSimilarities(similarities.map(x => x.similarity))
    .slice(0, 5)
    .map(r => similarities[r.index])
    .filter((n): n is NonNullable<typeof n> => !!n);

  return {
    candidate: { headline: input.headline, body: input.body, stance: input.stance as "support" | "oppose" | "mixed" },
    relevance: { score: relevanceScore, threshold: relevanceThreshold, passed: relevancePassed },
    novelty: { raw: rawNovelty, normalized: normalizedNovelty },
    reward: rewardScore,
    neighbors: topNeighbors.map(n => ({
      submissionId: n.id,
      similarity: n.similarity,
      headline: n.headline,
    })),
  };
}

export function resetNoveltyCache(articleId?: string): void {
  if (articleId) noveltyCache.delete(articleId);
  else noveltyCache.clear();
}
