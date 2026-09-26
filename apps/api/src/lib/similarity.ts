export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vectors must have equal dimensions");
  if (a.length === 0) throw new Error("Vectors must not be empty");

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const magA = Math.sqrt(normA);
  const magB = Math.sqrt(normB);
  if (magA === 0 || magB === 0) return 0;

  return dot / (magA * magB);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function weightedTopKSimilarity(
  similarities: number[],
  weights: number[],
): number {
  const k = Math.min(similarities.length, weights.length);
  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += similarities[i]! * weights[i]!;
  }
  return sum / weights.slice(0, k).reduce((acc, w) => acc + w, 0);
}

export function calculateRawNovelty(
  candidateSimilarities: number[],
  weights: number[],
): number {
  const sorted = [...candidateSimilarities].sort((a, b) => b - a);
  const localSimilarity = weightedTopKSimilarity(sorted, weights);
  return clamp01(1 - localSimilarity);
}

export function percentile(candidates: number[], value: number): number {
  if (candidates.length === 0) return 0;
  const count = candidates.filter(v => value >= v).length;
  return clamp01(count / candidates.length);
}

export function rankSimilarities(
  similarities: number[],
): Array<{ index: number; similarity: number }> {
  return similarities
    .map((similarity, index) => ({ index, similarity }))
    .sort((a, b) => b.similarity - a.similarity);
}
