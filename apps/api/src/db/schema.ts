import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const articleChunks = pgTable(
  "article_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("article_chunks_article_id_idx").on(table.articleId),
    uniqueIndex("article_chunks_unique").on(table.articleId, table.chunkIndex),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    headline: varchar("headline", { length: 200 }).notNull(),
    body: text("body").notNull(),
    stance: text("stance").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("submissions_article_id_idx").on(table.articleId),
    check("stance_check", sql`stance IN ('support', 'oppose', 'mixed')`),
  ],
);

export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    candidateSubmissionId: uuid("candidate_submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    relevanceScore: doublePrecision("relevance_score").notNull(),
    relevanceThreshold: doublePrecision("relevance_threshold").notNull(),
    relevancePassed: boolean("relevance_passed").notNull(),
    rawNovelty: doublePrecision("raw_novelty").notNull(),
    normalizedNovelty: doublePrecision("normalized_novelty").notNull(),
    rewardScore: doublePrecision("reward_score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("evaluations_article_id_idx").on(table.articleId),
    index("evaluations_candidate_submission_id_idx").on(table.candidateSubmissionId),
  ],
);

export type ArticleRow = typeof articles.$inferSelect;
export type ArticleChunkRow = typeof articleChunks.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type EvaluationRow = typeof evaluations.$inferSelect;
