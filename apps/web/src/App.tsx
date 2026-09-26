import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, FlaskConical, History, Newspaper, PenLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRoutes } from "@novel-relevancy/shared";
import { cn } from "@/lib/utils";

type Stance = "support" | "oppose" | "mixed";

interface Article {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  submissionCount: number;
  evaluationCount: number;
}

interface Neighbor {
  submissionId: string;
  similarity: number;
  headline: string;
}

interface Evaluation {
  id: string;
  candidateSubmissionId: string;
  relevanceScore: number;
  relevanceThreshold: number;
  relevancePassed: boolean;
  rawNovelty: number;
  normalizedNovelty: number;
  rewardScore: number;
  createdAt: string;
  candidate: { headline: string; body: string; stance: string };
  neighbors: Neighbor[];
}

const MAX_BODY_WORDS = 100;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function pct(value: number): string {
  return `${(clamp01(value) * 100).toFixed(1)}%`;
}

function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

async function readJson<T>(res: Response): Promise<T> {
  const payload = (await res.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!res.ok) throw new Error(payload?.error ?? `Request failed (${res.status})`);
  return payload?.data as T;
}

function articlePath(id: string): string {
  return `/articles/${encodeURIComponent(id)}`;
}

function routeFromLocation(): { name: "home" } | { name: "article"; id: string } {
  const path = window.location.pathname;
  if (path === "/" || path === "") return { name: "home" };
  const match = /^\/articles\/([^/]+)\/?$/.exec(path);
  if (match?.[1]) return { name: "article", id: decodeURIComponent(match[1]) };
  return { name: "home" };
}

function useRoute() {
  const [route, setRoute] = useState(routeFromLocation);
  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return route;
}

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function NavLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

function Badge({ tone, children }: { tone: "good" | "bad" | "neutral"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "good" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        tone === "bad" && "bg-rose-500/15 text-rose-700 dark:text-rose-400",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Meter({
  label,
  value,
  threshold,
  barClass,
  valueClass,
}: {
  label: string;
  value: number;
  threshold?: number;
  barClass: string;
  valueClass: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("text-xs font-semibold tabular-nums", valueClass)}>
          {pct(value)}
          {threshold !== undefined ? (
            <span className="ml-1 font-normal text-muted-foreground">/ gate {pct(threshold)}</span>
          ) : null}
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${clamp01(value) * 100}%` }} />
        {threshold !== undefined ? (
          <span
            className="absolute top-0 h-full w-px bg-foreground/40"
            style={{ left: `${clamp01(threshold) * 100}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden />;
}

function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <span className="text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Notice({ kind, text, onDismiss }: { kind: "error" | "ok"; text: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={cn(
        "mb-6 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
        kind === "error"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      <span>{text}</span>
      <button type="button" onClick={onDismiss} className="text-xs opacity-70 hover:opacity-100" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">proof of concept</span>
          <span>pgvector · Gemini embeddings</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Relevance &amp; Novelty Reward Console</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Pick an article, read it in full, then score a candidate comment. Relevance gates the decision; calibrated
          novelty against the existing corpus becomes the reward.
        </p>
      </header>
      {children}
    </div>
  );
}

function ArticleListPage({ onNotice }: { onNotice: (notice: { kind: "error" | "ok"; text: string } | null) => void }) {
  const { data: articles, isLoading, isError } = useQuery<Article[]>({
    queryKey: ["articles"],
    queryFn: () => fetch(apiRoutes.articles).then(res => readJson<Article[]>(res)),
  });

  useEffect(() => {
    if (isError) onNotice({ kind: "error", text: "Could not reach the API. Is `bun run run-local` running?" });
  }, [isError, onNotice]);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Newspaper className="size-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base">Articles</CardTitle>
        </div>
        <CardDescription>{isLoading ? "Loading…" : `${articles?.length ?? 0} article(s) with a seeded corpus`}</CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map(i => (
              <div key={i} className="rounded-xl border p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-2/3" />
                <Skeleton className="mt-3 h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<FlaskConical className="size-6" />}
            title="API unreachable"
            hint="Start the stack with `bun run run-local`, then reload this page."
          />
        ) : !articles || articles.length === 0 ? (
          <EmptyState
            icon={<Newspaper className="size-6" />}
            title="No articles yet"
            hint="Run `bun run db:seed` from the repo root to load the demo article and its 50-comment corpus."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {articles.map(article => (
              <NavLink key={article.id} href={articlePath(article.id)} className="group block">
                <div className="h-full rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[15px] font-semibold leading-snug">{article.title}</h2>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </div>
                  <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{article.content}</p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                    <Badge tone="neutral">{article.submissionCount} comments</Badge>
                    <Badge tone="neutral">{article.evaluationCount} evaluations</Badge>
                  </div>
                </div>
              </NavLink>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LatestResult({ evaluation }: { evaluation: Evaluation }) {
  const passed = evaluation.relevancePassed;
  return (
    <Card className="overflow-hidden border-primary/30">
      <CardHeader className="border-b bg-primary/[0.04]">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <CardTitle className="text-sm">Latest score</CardTitle>
          <span className="ml-auto">
            <Badge tone={passed ? "good" : "bad"}>{passed ? "PASS" : "FAIL"}</Badge>
          </span>
        </div>
        <CardDescription className="truncate">“{evaluation.candidate.headline}”</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reward</div>
            <div className="text-4xl font-semibold tabular-nums">{pct(evaluation.rewardScore)}</div>
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            <div className="tabular-nums">relevance {pct(evaluation.relevanceScore)}</div>
            <div className="tabular-nums">novelty {pct(evaluation.normalizedNovelty)}</div>
          </div>
        </div>

        <div className="space-y-3">
          <Meter
            label="Relevance"
            value={evaluation.relevanceScore}
            threshold={evaluation.relevanceThreshold}
            barClass={passed ? "bg-emerald-500" : "bg-rose-500"}
            valueClass={passed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
          />
          <Meter label="Novelty (calibrated)" value={evaluation.normalizedNovelty} barClass="bg-sky-500" valueClass="text-sky-600 dark:text-sky-400" />
          <Meter label="Novelty (raw)" value={evaluation.rawNovelty} barClass="bg-sky-500/50" valueClass="text-muted-foreground" />
        </div>

        {evaluation.neighbors.length > 0 ? (
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Why this score — nearest neighbours
            </h4>
            <ul className="space-y-1.5">
              {evaluation.neighbors.map(n => (
                <li key={n.submissionId} className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">{n.headline}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{pct(n.similarity)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HistoryRow({ evaluation }: { evaluation: Evaluation }) {
  const [open, setOpen] = useState(false);
  const passed = evaluation.relevancePassed;
  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <Badge tone={passed ? "good" : "bad"}>{passed ? "PASS" : "FAIL"}</Badge>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{evaluation.candidate.headline}</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
            stance {evaluation.candidate.stance} · relevance {pct(evaluation.relevanceScore)} · reward {pct(evaluation.rewardScore)}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{pct(evaluation.rewardScore)}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{evaluation.candidate.body}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Meter
              label="Relevance"
              value={evaluation.relevanceScore}
              threshold={evaluation.relevanceThreshold}
              barClass={passed ? "bg-emerald-500" : "bg-rose-500"}
              valueClass={passed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
            />
            <Meter label="Novelty (calibrated)" value={evaluation.normalizedNovelty} barClass="bg-sky-500" valueClass="text-sky-600 dark:text-sky-400" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArticleDetailPage({ id, onNotice }: { id: string; onNotice: (notice: { kind: "error" | "ok"; text: string } | null) => void }) {
  const queryClient = useQueryClient();
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [stance, setStance] = useState<Stance>("support");
  const [latest, setLatest] = useState<Evaluation | null>(null);

  const words = countWords(body);
  const tooLong = words > MAX_BODY_WORDS;

  const {
    data: article,
    isLoading: articleLoading,
    isError: articleError,
  } = useQuery<Article>({
    queryKey: ["article", id],
    queryFn: () => fetch(apiRoutes.article(id)).then(res => readJson<Article>(res)),
  });

  const { data: evaluations, isLoading: evalsLoading } = useQuery<Evaluation[]>({
    queryKey: ["evaluations", id],
    queryFn: () => fetch(apiRoutes.articleEvaluations(id)).then(res => readJson<Evaluation[]>(res)),
    enabled: !articleError,
  });

  useEffect(() => {
    setLatest(null);
    setHeadline("");
    setBody("");
  }, [id]);

  const evaluate = useMutation({
    mutationFn: () =>
      fetch(apiRoutes.articleEvaluate(id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline, body, stance }),
      }).then(res => readJson<Evaluation>(res)),
    onSuccess: result => {
      setLatest(result);
      setHeadline("");
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["evaluations", id] });
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      queryClient.invalidateQueries({ queryKey: ["article", id] });
      onNotice({ kind: "ok", text: `Scored: relevance ${pct(result.relevanceScore)}, reward ${pct(result.rewardScore)}.` });
    },
    onError: (error: Error) => onNotice({ kind: "error", text: error.message }),
  });

  const busy = evaluate.isPending;
  const canEvaluate = headline.trim() !== "" && body.trim() !== "" && !tooLong && !busy;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canEvaluate) evaluate.mutate();
  };

  return (
    <div className="space-y-6">
      <NavLink
        href="/"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All articles
      </NavLink>

      {articleLoading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      ) : articleError || !article ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<Newspaper className="size-6" />}
              title="Article not found"
              hint="It may have been removed. Go back to the article list and pick another one."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{article.submissionCount} comments in corpus</Badge>
                <Badge tone="neutral">{article.evaluationCount} evaluations</Badge>
              </div>
              <CardTitle className="mt-2 text-2xl leading-tight tracking-tight">{article.title}</CardTitle>
              <CardDescription className="tabular-nums">
                Added {new Date(article.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-none space-y-4 text-[15px] leading-relaxed text-foreground/90">
                {article.content.split(/\n\s*\n/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <PenLine className="size-4 text-muted-foreground" aria-hidden />
                  <CardTitle className="text-sm">Score a candidate comment</CardTitle>
                </div>
                <CardDescription className="text-xs">Under {MAX_BODY_WORDS} words. The score appears immediately.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <form onSubmit={onSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="headline" className="text-xs">
                      Headline
                    </Label>
                    <Input
                      id="headline"
                      value={headline}
                      onChange={e => setHeadline(e.target.value)}
                      placeholder="One-line summary of the comment"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="body" className="text-xs">
                        Body
                      </Label>
                      <span className={cn("text-[11px] tabular-nums", tooLong ? "text-rose-600" : "text-muted-foreground")}>
                        {words}/{MAX_BODY_WORDS} words
                      </span>
                    </div>
                    <Textarea
                      id="body"
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      placeholder="Write the comment exactly as a reader would post it."
                      className="min-h-[130px] text-sm"
                      aria-invalid={tooLong}
                    />
                    {tooLong ? <p className="text-xs text-rose-600">Body must be {MAX_BODY_WORDS} words or fewer.</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Stance</Label>
                    <Select value={stance} onValueChange={v => setStance(v as Stance)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="support">Support</SelectItem>
                        <SelectItem value="oppose">Oppose</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={!canEvaluate}>
                    {evaluate.isPending ? "Scoring…" : "Evaluate comment"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-6 lg:sticky lg:top-6">
              {latest ? (
                <LatestResult evaluation={latest} />
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <FlaskConical className="size-6 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">No score yet</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      Submit a comment and its relevance, novelty and reward will appear here instantly.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" aria-hidden />
                  <CardTitle className="text-sm">Evaluation history</CardTitle>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {evalsLoading ? "loading…" : `${evaluations?.length ?? 0} result(s)`}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 p-4">
              {evalsLoading ? (
                <div className="space-y-2.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="rounded-lg border px-4 py-3">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="mt-2 h-3 w-1/3" />
                    </div>
                  ))}
                </div>
              ) : !evaluations || evaluations.length === 0 ? (
                <EmptyState
                  icon={<History className="size-6" />}
                  title="Nothing scored yet"
                  hint="Your evaluations for this article will accumulate here."
                />
              ) : (
                evaluations.map(evaluation => <HistoryRow key={evaluation.id} evaluation={evaluation} />)
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function App() {
  const route = useRoute();
  const [notice, setNotice] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  return (
    <Shell>
      {notice ? <Notice kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} /> : null}
      {route.name === "article" ? (
        <ArticleDetailPage key={route.id} id={route.id} onNotice={setNotice} />
      ) : (
        <ArticleListPage onNotice={setNotice} />
      )}
    </Shell>
  );
}
