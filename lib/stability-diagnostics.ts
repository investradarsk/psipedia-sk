/**
 * Low-cardinality failure diagnostics. Never accept a raw URL, SQL statement,
 * exception message, stack, account ID, token or user-supplied correlation ID.
 * Cloudflare associates console events with the current Worker invocation.
 */
const stages = [
  "unspecified", "listing", "category_previews", "hero_visual", "article_discovery",
  "directory_listing", "directory_category_previews", "directory_article_discovery",
  "directory_detail", "public_hero_visual", "home_articles", "home_events",
  "home_help", "home_directory", "banner_colors", "article_listing", "article_detail",
  "section_articles", "breed_editorial_teasers", "events_listing", "events_calendar",
  "help_listing", "related_events", "article_author_profile", "partner_contact_profile",
  "partner_auth_method_summary", "partner_notification_preferences", "partner_activity",
  "admin_quality", "navigation", "html", "media", "hero", "worker_fetch",
] as const;

export type StabilityStage = (typeof stages)[number];
export type StabilityOutcome = "retrying" | "recovered" | "exhausted" | "aborted" |
  "not_retryable" | "degraded" | "failed" | "server_error";
type Dependency = "read" | "cache" | "worker";
type RequestKind = "rsc" | "document" | "api" | "other";
type Area = "public" | "admin" | "partner" | "api";

export function stabilityDuration(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

export function logStability(input: {
  stage: StabilityStage;
  dependency: Dependency;
  outcome: StabilityOutcome;
  durationMs: number;
  attempt?: 0 | 1 | 2;
  transient?: boolean;
  operation?: "match" | "put";
  status?: number;
  kind?: RequestKind;
  area?: Area;
}) {
  const stage = stages.includes(input.stage) ? input.stage : "unspecified";
  const record = {
    event: "psipedia_stability",
    stage,
    dependency: input.dependency,
    outcome: input.outcome,
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : 0,
    attempt: input.attempt,
    transient: input.transient,
    operation: input.operation,
    status: input.status,
    kind: input.kind,
    area: input.area,
  };
  const line = JSON.stringify(record);
  if (input.outcome === "recovered") console.info(line);
  else if (["exhausted", "failed", "server_error", "not_retryable"].includes(input.outcome)) console.error(line);
  else console.warn(line);
}

export function requestStabilityContext(request: Request): { kind: RequestKind; area: Area } {
  const path = new URL(request.url).pathname;
  const route = path.replace(/\.rsc$/, "");
  const within = (prefix: string) => route === prefix || route.startsWith(prefix + "/");
  const area = within("/admin") ? "admin" : within("/partner") ? "partner" : within("/api") ? "api" : "public";
  const kind = request.headers.get("rsc") === "1" || path.endsWith(".rsc") ? "rsc"
    : area === "api" ? "api"
    : request.method === "GET" && request.headers.get("accept")?.includes("text/html") ? "document" : "other";
  return { kind, area };
}

/** Observe only the original fetch. Do not retry or manufacture a response. */
export async function observeWorkerResponse(request: Request, run: () => Promise<Response>): Promise<Response> {
  const start = performance.now();
  const context = requestStabilityContext(request);
  try {
    const response = await run();
    if (response.status >= 500) {
      logStability({ stage: "worker_fetch", dependency: "worker", outcome: "server_error",
        durationMs: stabilityDuration(start), status: response.status, ...context });
    }
    return response;
  } catch (error) {
    const aborted = request.signal.aborted || (error instanceof Error && error.name === "AbortError");
    logStability({ stage: "worker_fetch", dependency: "worker", outcome: aborted ? "aborted" : "failed",
      durationMs: stabilityDuration(start), ...context });
    throw error;
  }
}
