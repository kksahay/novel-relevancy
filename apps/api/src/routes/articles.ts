import type { BunRequest } from "bun";
import { json, HttpError, readJson, asObject, requiredString } from "../lib/http";
import { validateSubmission, validateArticle, articleSchema, STANCE_VALUES } from "../lib/validation";
import { env } from "../env";
import * as articleRepo from "../repositories/articles";
import * as submissionRepo from "../repositories/submissions";
import * as evaluationRepo from "../repositories/evaluations";
import { chunkArticle, buildNoveltyRepresentation } from "../services/chunking";
import { embeddingService } from "../services/embedding";
import { evaluateCandidate } from "../services/evaluation";

export async function listArticles(req: BunRequest<"/api/articles">): Promise<Response> {
  const rows = await articleRepo.getArticles();
  return json({ data: rows });
}

export async function getArticle(req: BunRequest<"/api/articles/:articleId">): Promise<Response> {
  const article = await articleRepo.getArticle(req.params.articleId);
  if (!article) throw new HttpError(404, "Article not found");
  return json({ data: article });
}

export async function createArticle(req: BunRequest<"/api/articles">): Promise<Response> {
  const body = asObject(await readJson(req));
  const { title, content } = articleSchema.parse(body);
  const article = await articleRepo.createArticle({ title, content });
  if (!article) throw new HttpError(500, "Failed to create article");

  const chunks = chunkArticle(article.content);
  const embeddings = await embeddingService.embedMany(chunks);

  await articleRepo.upsertArticleChunks(article.id, chunks.map((c, i) => ({
    chunkIndex: i,
    content: c,
    embedding: embeddings[i]!,
  })));

  return json({ data: article }, { status: 201, headers: { location: `/api/articles/${article.id}` } });
}

export async function listSubmissions(req: BunRequest<"/api/articles/:articleId/submissions">): Promise<Response> {
  const rows = await submissionRepo.getSubmissions(req.params.articleId);
  return json({ data: rows });
}

export async function createSubmission(req: BunRequest<"/api/articles/:articleId/submissions">): Promise<Response> {
  const body = asObject(await readJson(req));
  const headline = requiredString(body, "headline");
  const bodyText = requiredString(body, "body");
  const stance = requiredString(body, "stance") as "support" | "oppose" | "mixed";
  if (!STANCE_VALUES.includes(stance)) {
    throw new HttpError(400, '"stance" must be one of: support, oppose, mixed', { field: "stance" });
  }
  validateSubmission({ headline, body: bodyText, stance });

  const article = await articleRepo.getArticle(req.params.articleId);
  if (!article) throw new HttpError(404, "Article not found");

  const embedding = await embeddingService.embedText(buildNoveltyRepresentation(headline, bodyText));
  const created = await submissionRepo.createSubmission({
    articleId: article.id,
    headline,
    body: bodyText,
    stance,
    embedding,
  });
  if (!created) throw new HttpError(500, "Failed to create submission");
  return json({ data: created }, { status: 201, headers: { location: `/api/submissions/${created.id}` } });
}

export async function evaluate(req: BunRequest<"/api/articles/:articleId/evaluate">): Promise<Response> {
  const body = asObject(await readJson(req));
  const headline = requiredString(body, "headline");
  const bodyText = requiredString(body, "body");
  const stance = requiredString(body, "stance") as "support" | "oppose" | "mixed";
  if (!STANCE_VALUES.includes(stance)) {
    throw new HttpError(400, '"stance" must be one of: support, oppose, mixed', { field: "stance" });
  }
  validateSubmission({ headline, body: bodyText, stance });

  const result = await evaluateCandidate({
    articleId: req.params.articleId,
    headline,
    body: bodyText,
    stance,
  });
  return json({ data: result });
}

export async function listEvaluations(req: BunRequest<"/api/articles/:articleId/evaluations">): Promise<Response> {
  const rows = await evaluationRepo.getEvaluations(req.params.articleId);
  return json({ data: rows });
}

export async function getEvaluation(req: BunRequest<"/api/evaluations/:evaluationId">): Promise<Response> {
  const evalRow = await evaluationRepo.getEvaluation(req.params.evaluationId);
  if (!evalRow) throw new HttpError(404, "Evaluation not found");
  return json({ data: evalRow });
}

export const articleRoutes = {
  "/api/articles": {
    GET: listArticles,
    POST: createArticle,
  },
  "/api/articles/:articleId": {
    GET: getArticle,
  },
  "/api/articles/:articleId/submissions": {
    GET: listSubmissions,
    POST: createSubmission,
  },
  "/api/articles/:articleId/evaluate": {
    POST: evaluate,
  },
  "/api/articles/:articleId/evaluations": {
    GET: listEvaluations,
  },
  "/api/evaluations/:evaluationId": {
    GET: getEvaluation,
  },
};
