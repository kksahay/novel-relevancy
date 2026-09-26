import { z } from "zod";

export const STANCE_VALUES = ["support", "oppose", "mixed"] as const;
export type Stance = (typeof STANCE_VALUES)[number];

export const articleSchema = z.object({
  title: z.string().min(1, "Article title is required"),
  content: z.string().min(1, "Article content is required"),
});

export const submissionSchema = z.object({
  headline: z.string().min(1, "Headline is required"),
  body: z.string().min(1, "Body is required"),
  stance: z.union([z.literal("support"), z.literal("oppose"), z.literal("mixed")]),
});

export type ArticleInput = z.infer<typeof articleSchema>;
export type SubmissionInput = z.infer<typeof submissionSchema>;

/** Count words in a string. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateSubmission(input: SubmissionInput): void {
  const parsed = submissionSchema.parse(input);
  if (wordCount(parsed.body) >= 100) {
    throw new Error("Submission body must be under 100 words");
  }
}

export function validateArticle(input: ArticleInput): void {
  articleSchema.parse(input);
}
