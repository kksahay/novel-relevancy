import { describe, expect, it } from "bun:test";
import { cosineSimilarity, clamp01, weightedTopKSimilarity, calculateRawNovelty, percentile, rankSimilarities } from "../src/lib/similarity";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
  });

  it("throws on different lengths", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow("equal dimensions");
  });

  it("throws on empty vectors", () => {
    expect(() => cosineSimilarity([], [])).toThrow("not be empty");
  });
});

describe("clamp01", () => {
  it("clamps values to [0, 1]", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe("weightedTopKSimilarity", () => {
  it("computes weighted average", () => {
    const result = weightedTopKSimilarity([0.9, 0.8, 0.7], [0.4, 0.3, 0.3]);
    expect(result).toBeCloseTo((0.9 * 0.4 + 0.8 * 0.3 + 0.7 * 0.3) / (0.4 + 0.3 + 0.3));
  });
});

describe("calculateRawNovelty", () => {
  it("returns higher novelty for dissimilar candidates", () => {
    const similar = [0.9, 0.85, 0.88, 0.91, 0.87];
    const dissimilar = [0.1, 0.2, 0.15, 0.05, 0.1];
    expect(calculateRawNovelty(dissimilar, [0.4, 0.25, 0.15, 0.12, 0.08]))
      .toBeGreaterThan(calculateRawNovelty(similar, [0.4, 0.25, 0.15, 0.12, 0.08]));
  });

  it("returns 0 when all similarities are 1", () => {
    expect(calculateRawNovelty([1, 1, 1, 1, 1], [0.4, 0.25, 0.15, 0.12, 0.08])).toBe(0);
  });
});

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it("computes percentile correctly", () => {
    expect(percentile([0.1, 0.5, 0.9], 0.1)).toBeCloseTo(1 / 3);
    expect(percentile([0.1, 0.5, 0.9], 0.9)).toBe(1);
  });
});

describe("rankSimilarities", () => {
  it("sorts descending by similarity", () => {
    const result = rankSimilarities([0.3, 0.9, 0.5]);
    expect(result[0]!.similarity).toBe(0.9);
    expect(result[1]!.similarity).toBe(0.5);
    expect(result[2]!.similarity).toBe(0.3);
  });

  it("includes correct indices", () => {
    const result = rankSimilarities([0.3, 0.9, 0.5]);
    expect(result[0]!.index).toBe(1);
  });
});
