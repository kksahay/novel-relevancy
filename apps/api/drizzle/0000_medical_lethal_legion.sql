CREATE TABLE "article_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"candidate_submission_id" uuid NOT NULL,
	"relevance_score" double precision NOT NULL,
	"relevance_threshold" double precision NOT NULL,
	"relevance_passed" boolean NOT NULL,
	"raw_novelty" double precision NOT NULL,
	"normalized_novelty" double precision NOT NULL,
	"reward_score" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"headline" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"stance" text NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stance_check" CHECK (stance IN ('support', 'oppose', 'mixed'))
);
--> statement-breakpoint
ALTER TABLE "article_chunks" ADD CONSTRAINT "article_chunks_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_candidate_submission_id_submissions_id_fk" FOREIGN KEY ("candidate_submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_chunks_article_id_idx" ON "article_chunks" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "article_chunks_unique" ON "article_chunks" USING btree ("article_id","chunk_index");--> statement-breakpoint
CREATE INDEX "evaluations_article_id_idx" ON "evaluations" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "evaluations_candidate_submission_id_idx" ON "evaluations" USING btree ("candidate_submission_id");--> statement-breakpoint
CREATE INDEX "submissions_article_id_idx" ON "submissions" USING btree ("article_id");