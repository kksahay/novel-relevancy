import { env } from "../env";

/**
 * Deterministic sentence-aware chunker.
 *
 * Splits on sentence boundaries (. ? !) and accumulates words until
 * maxWordsPerChunk is reached, never cutting mid-sentence.
 */
export function chunkArticle(content: string, maxWordsPerChunk = env.maxWordsPerChunk): string[] {
  const sentences = content
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/);

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const words = trimmed.split(/\s+/);

    if (current === "") {
      current = trimmed;
    } else if (current.split(/\s+/).length + words.length <= maxWordsPerChunk) {
      current += " " + trimmed;
    } else {
      chunks.push(current.trim());
      current = trimmed;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  if (chunks.length === 0) chunks.push(content.trim() || "Untitled");
  return chunks;
}

export function buildNoveltyRepresentation(headline: string, body: string): string {
  return `Headline: ${headline}\nBody: ${body}`;
}
