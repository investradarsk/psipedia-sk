import { env, waitUntil } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { automationCategoryBySlug, automationDiscoveryRootsForCategory } from "@/lib/admin-automation-presentation";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";
import { claimAutomationDiscoveryRootManualRun, runAutomationDiscoveryRootManual } from "@/lib/data-automation-discovery-runner";
import { recordAutomationSearchAdminEvent, releaseAutomationSearchCooldownsForAdmin } from "@/lib/data-automation-search-admin";
import { AUTOMATION_SEARCH_HARD_ROOT_DAILY_REQUESTS, automationSearchBudgetPolicy } from "@/lib/data-automation-search-budget";
import { TavilyAutomationSearchProvider } from "@/lib/data-automation-search-tavily";
import { isTavilySearchDiscoveryRoot } from "@/lib/tavily-canary-control";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };
type Bindings = { DB?: D1Database; TAVILY_API_KEY?: string };

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;
  const slug = (await params).category;
  const category = automationCategoryBySlug(slug);
  if (!category) return Response.json({ error: "Neznáma kategória." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  if (action !== "extend-budget" && action !== "run") return Response.json({ error: "Neznáma akcia hľadania." }, { status: 400 });
  const bindings = env as unknown as Bindings;
  if (!bindings.DB) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
  const now = new Date();
  const allRoots = await listAutomationDiscoveryRoots(bindings.DB, 100, now);
  const roots = automationDiscoveryRootsForCategory(allRoots, slug).filter(isTavilySearchDiscoveryRoot);
  if (!roots.length) return Response.json({ error: "Táto kategória nemá vyhľadávací root." }, { status: 409 });

  if (action === "extend-budget") {
    const exhausted = roots.filter((root) => root.searchSafety && root.searchSafety.remainingRootRequests <= 0);
    if (!exhausted.length) return Response.json({ error: "Denný limit tejto kategórie ešte nie je vyčerpaný." }, { status: 409 });
    const grants: Array<{ rootId: number; extraRequests: number }> = [];
    for (const root of exhausted) {
      const policy = automationSearchBudgetPolicy(root, now);
      const extraRequests = Math.max(0, Math.min(policy.providerRequestsPerRun, AUTOMATION_SEARCH_HARD_ROOT_DAILY_REQUESTS - policy.rootDailyRequests));
      if (!extraRequests) continue;
      await recordAutomationSearchAdminEvent({ root, actorEmail: auth.user.email, reason: "MANUAL_BUDGET_OVERRIDE", extraRequests, now }, bindings.DB);
      grants.push({ rootId: root.id, extraRequests });
    }
    if (!grants.length) return Response.json({ error: "Bezpečnostný hard limit už nie je možné zvýšiť." }, { status: 409 });
    const cooldown = await releaseAutomationSearchCooldownsForAdmin({ rootIds: grants.map((grant) => grant.rootId), now }, bindings.DB);
    return Response.json({ ok: true, action, grantedRootCount: grants.length, extraRequests: grants.reduce((sum, grant) => sum + grant.extraRequests, 0), releasedCooldownRows: cooldown.released }, { headers: { "cache-control": "no-store" } });
  }

  const enabled = roots.filter((root) => root.enabled && root.reviewStatus === "APPROVED");
  if (!enabled.length) return Response.json({ error: "Najprv zapni automatické hľadanie pre túto kategóriu." }, { status: 409 });
  const runnable = enabled.filter((root) => !root.searchSafety || root.searchSafety.remainingRootRequests > 0);
  let blockedRootCount = enabled.length - runnable.length;
  if (!runnable.length) return Response.json({ error: "Dnešný limit je vyčerpaný. Najprv použi Obnoviť limit.", code: "SEARCH_BUDGET_BLOCKED" }, { status: 429, headers: { "cache-control": "no-store" } });

  const provider = new TavilyAutomationSearchProvider({ apiKey: bindings.TAVILY_API_KEY });
  if (!provider.credentialConfigured) {
    return Response.json({
      error: "Tavily vyhľadávanie nie je nakonfigurované.",
      code: "SEARCH_PROVIDER_CONFIG_MISSING",
      startedRootCount: 0,
      blockedRootCount: enabled.length,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  for (const root of runnable) {
    await recordAutomationSearchAdminEvent({ root, actorEmail: auth.user.email, reason: "MANUAL_RUN", extraRequests: 0, now }, bindings.DB);
  }
  await releaseAutomationSearchCooldownsForAdmin({ rootIds: runnable.map((root) => root.id), now }, bindings.DB);

  const claims: NonNullable<Awaited<ReturnType<typeof claimAutomationDiscoveryRootManualRun>>>[] = [];
  for (const root of runnable) {
    try {
      const claim = await claimAutomationDiscoveryRootManualRun({
        rootId: root.id,
        database: bindings.DB,
        now,
      });
      if (claim) claims.push(claim);
      else blockedRootCount += 1;
    } catch (error) {
      blockedRootCount += 1;
      console.error(JSON.stringify({
        event: "automation_category_manual_search_claim",
        category: slug,
        rootId: root.id,
        result: "blocked",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (!claims.length) {
    return Response.json({
      error: "Hľadanie sa nespustilo. Vyhľadávací root je práve aktívny alebo ho blokuje bezpečnostná politika.",
      code: "SEARCH_MANUAL_RUN_BLOCKED",
      startedRootCount: 0,
      blockedRootCount,
    }, { status: 409, headers: { "cache-control": "no-store" } });
  }

  const task = Promise.allSettled(claims.map((claim) => runAutomationDiscoveryRootManual({
    claim,
    options: {
      database: bindings.DB!,
      searchProvider: provider,
      tavilyApiKey: bindings.TAVILY_API_KEY,
      internetTransport: "TAVILY_ONLY",
    },
  }))).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") console.error(JSON.stringify({ event: "automation_category_manual_search", category: slug, rootId: claims[index]?.root.id, result: "failed", error: result.reason instanceof Error ? result.reason.message : String(result.reason) }));
    });
  });
  waitUntil(task);
  return Response.json({ ok: true, action, startedRootCount: claims.length, blockedRootCount }, { headers: { "cache-control": "no-store" } });
}
