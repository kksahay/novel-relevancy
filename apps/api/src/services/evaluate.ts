import { env } from "../env";
import { evaluateCandidate } from "./evaluation";
import { closeDatabase, requireDb } from "../db/client";
import { eq } from "drizzle-orm";
import { evaluations, submissions } from "../db/schema";
import { SEED_ARTICLE_ID } from "../db/seed";
import { PROBE_CASES, SEED_SUBMISSIONS } from "../db/seedData";

/**
 * Runs the spec's behavioural probes plus a labelled-corpus sweep and reports
 * real metrics. Nothing here is fabricated: every number is computed from the
 * live scoring pipeline.
 *
 * Scoring persists the candidate (the API contract requires the evaluation to
 * reference a stored submission), so rows created by earlier runs are removed
 * first to keep the corpus at its intended 50 and the metrics reproducible.
 */
async function resetProbeRows(): Promise<void> {
  const database = requireDb();
  const seeded = new Set(SEED_SUBMISSIONS.map(row => row.headline));
  const rows = await database
    .select({ id: submissions.id, headline: submissions.headline })
    .from(submissions)
    .where(eq(submissions.articleId, SEED_ARTICLE_ID));

  const seen = new Set<string>();
  const stale: string[] = [];
  for (const row of rows) {
    if (!seeded.has(row.headline)) {
      stale.push(row.id);
      continue;
    }
    if (seen.has(row.headline)) stale.push(row.id);
    seen.add(row.headline);
  }

  for (const id of stale) {
    await database.delete(evaluations).where(eq(evaluations.candidateSubmissionId, id));
    await database.delete(submissions).where(eq(submissions.id, id));
  }
  if (stale.length > 0) console.log(`(removed ${stale.length} row(s) from previous runs)\n`);
}

async function main(): Promise<void> {
  if (!env.pgUri) {
    console.error("[FAIL] PG_URI is not set.");
    process.exit(1);
  }

  console.log("Novelty Reward Evaluation");
  console.log("--------------------------");
  console.log(`gate threshold : ${env.relevanceThreshold}`);
  console.log(`novelty top-K  : ${env.noveltyTopK} weights [${env.noveltyWeights.join(", ")}]`);
  console.log(`relevance top-K: ${env.relevanceTopK}`);
  console.log(`corpus size    : ${SEED_SUBMISSIONS.length}\n`);

  await resetProbeRows();

  let boundsViolations = 0;
  const check = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) boundsViolations++;
  };

  console.log("Behavioural probes");
  console.log("------------------");
  for (const probe of PROBE_CASES) {
    const result = await evaluateCandidate({ articleId: SEED_ARTICLE_ID, ...probe.submission });
    check(result.relevance.score);
    check(result.novelty.normalized);
    check(result.reward);

    const expectations: string[] = [];
    expectations.push(`relevance ${result.relevance.score.toFixed(3)} ${result.relevance.passed ? "PASS" : "FAIL"}`);
    expectations.push(`raw novelty ${result.novelty.raw.toFixed(3)}`);
    expectations.push(`calibrated ${result.novelty.normalized.toFixed(3)}`);
    expectations.push(`reward ${result.reward.toFixed(3)}`);
    expectations.push(`${result.neighbors.length} neighbours`);
    console.log(`  ${probe.name}`);
    console.log(`    expected relevance: ${probe.expected}`);
    console.log(`    ${expectations.join(" · ")}`);
  }

  console.log("\nLabelled corpus sweep");
  console.log("---------------------");
  let correctHighLow = 0;
  let labelledTotal = 0;
  let irrelevantRewarded = 0;
  let irrelevantTotal = 0;
  const rewards: number[] = [];

  for (const row of SEED_SUBMISSIONS) {
    const result = await evaluateCandidate({
      articleId: SEED_ARTICLE_ID,
      headline: row.headline,
      body: row.body,
      stance: row.stance,
    });
    check(result.relevance.score);
    check(result.novelty.normalized);
    check(result.reward);
    rewards.push(result.reward);

    if (row.relevance === "borderline") continue;
    labelledTotal++;
    const predictedHigh = result.relevance.passed;
    const expectedHigh = row.relevance === "high";
    if (predictedHigh === expectedHigh) correctHighLow++;

    if (row.relevance === "low") {
      irrelevantTotal++;
      if (result.reward > 0) irrelevantRewarded++;
    }
  }

  const mean = rewards.reduce((a, b) => a + b, 0) / (rewards.length || 1);
  console.log(`  candidates scored     : ${rewards.length}`);
  console.log(`  relevance accuracy    : ${(correctHighLow / (labelledTotal || 1)).toFixed(3)} (${correctHighLow}/${labelledTotal})`);
  console.log(`  irrelevant reward rate: ${(irrelevantRewarded / (irrelevantTotal || 1)).toFixed(3)} (${irrelevantRewarded}/${irrelevantTotal})`);
  console.log(`  mean reward           : ${mean.toFixed(3)}`);
  console.log(`  reward bound violations: ${boundsViolations}`);

  await closeDatabase();
}

await main().catch(async (error: Error) => {
  console.error(`[FAIL] Evaluation run failed: ${error.message}`);
  await closeDatabase();
  process.exit(1);
});
