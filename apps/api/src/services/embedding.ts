import { GoogleGenAI } from "@google/genai";
import { env, assertGeminiConfigured } from "../env";

let aiInstance: GoogleGenAI | undefined;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    assertGeminiConfigured();
    aiInstance = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }
  return aiInstance;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Simple bounded-concurrency runner. */
async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    let i = next++;
    while (i < items.length) {
      await fn(items[i]!, i);
      i = next++;
    }
  });
  await Promise.all(workers);
}

export class EmbeddingService {
  async embedText(text: string): Promise<number[]> {
    const response = await getAI().models.embedContent({
      model: env.geminiEmbeddingModel,
      contents: [text],
      config: {
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: env.geminiEmbeddingDimensions,
      },
    });
    const embedding = response.embeddings?.[0]?.values;
    if (!embedding || embedding.length === 0) {
      throw new Error("Gemini returned an empty embedding");
    }
    return embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    assertGeminiConfigured();

    const results: number[][] = new Array(texts.length);
    const batchSize = env.geminiBatchSize;
    const concurrency = env.geminiMaxConcurrency;

    await runWithConcurrency(
      Array.from({ length: Math.ceil(texts.length / batchSize) }, (_, i) => i),
      async (batchIndex) => {
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, texts.length);
        const batch = texts.slice(start, end);

        const response = await getAI().models.embedContent({
          model: env.geminiEmbeddingModel,
          contents: batch,
          config: {
            taskType: "SEMANTIC_SIMILARITY",
            outputDimensionality: env.geminiEmbeddingDimensions,
          },
        });

        const embeddings = response.embeddings ?? [];
        for (let i = 0; i < embeddings.length; i++) {
          const embedding = embeddings[i]?.values;
          if (!embedding || embedding.length === 0) {
            throw new Error(`Gemini returned an empty embedding for text at index ${start + i}`);
          }
          results[start + i] = embedding;
        }
      },
      concurrency,
    );

    return results;
  }
}

export const embeddingService = new EmbeddingService();
