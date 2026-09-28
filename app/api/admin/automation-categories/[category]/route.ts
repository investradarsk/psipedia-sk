import { env, waitUntil } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import {
  automationCategoryBySlug,
  automationDiscoveryRootsForCategory,
  isAutomationCadenceOption,
} from "@/lib/admin-automation-presentation";
import {
  type AutomationDiscoveryRoot,
  listAutomationDiscoveryRoots,
  reviewAutomationDiscoveryRoot,
  setAutomationDiscoveryRootCadence,
  setAutomationDiscoveryRootEnabled,
} from "@/lib/data-automation-discovery-store";
import { runAutomationDiscoveryRootCanary } from "@/lib/data-automation-discovery-runner";
import { releaseFailedDirectDiscoveryCooldowns } from "@/lib/data-automation-direct-discovery-recovery";
import { getGovernanceState, upsertGovernanceReview } from "@/lib/data-automation-governance";
import { TavilyAutomationSearchProvider } from "@/lib/data-automation-search-tavily";
import {
  isTavilySearchDiscoveryRoot,
  tavilySearchGovernancePresetForRoot,
} from "@/lib/tavily-canary-control";
import { configureDirectEntityRefreshSetting } from "@/lib/data-automation-product-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };
type Bindings = { DB?: D1Database; TAVILY_API_KEY?: string };

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const slug = (await params).category;
  const category = automationCategoryBySlug(slug);
  if (!category) return Response.json({ error: "Neznáma kategória." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const enabled = body?.enabled === true;
  const cadenceMinutes = Number(body?.cadenceMinutes);
  if (!isAutomationCadenceOption(cadenceMinutes)) {
    return Response.json({ error: "Vyber platnú frekvenciu hľadania." }, { status: 400 });
  }

  const bindings = env as unknown as Bindings;
  if (!bindings.DB) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });

  if (body?.kind === "refresh") {
    if (category.mode !== "DIRECT_ENTITY") {
      return Response.json({ error: "Táto kategória nepoužíva kontrolu existujúcich entít." }, { status: 400 });
    }
    try {
      const setting = await configureDirectEntityRefreshSetting({
        categorySlug: category.slug as "veterinari" | "psie-sluzby" | "utulky-organizacie",
        enabled,
        cadenceMinutes,
      }, bindings.DB);
      return Response.json({ setting }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nastavenie kontroly zmien sa nepodarilo uložiť.";
      return Response.json({ error: message }, { status: 409 });
    }
  }

  try {
    const allRoots = await listAutomationDiscoveryRoots(bindings.DB, 100);
    const roots = automationDiscoveryRootsForCategory(allRoots, slug).filter(isTavilySearchDiscoveryRoot);
    if (!roots.length) {
      return Response.json({
        error: "Pre túto kategóriu zatiaľ nie je pripravené automatické hľadanie zdrojov.",
      }, { status: 409 });
    }

    const wasEnabled = roots.some((root) => root.enabled);
    const unchangedDirectRetry = enabled
      && category.mode === "DIRECT_ENTITY"
      && roots.every((root) => root.enabled && root.cadenceMinutes === cadenceMinutes);
    const directRetryBudgetExhausted = unchangedDirectRetry
      && roots.every((root) => root.searchSafety && root.searchSafety.remainingRootRequests <= 0);
    if (directRetryBudgetExhausted) {
      return Response.json({
        error: "Denný limit hľadania je dnes vyčerpaný. Nastavenie je v poriadku; nový pokus bude možný po obnovení denného limitu.",
        code: "SEARCH_BUDGET_BLOCKED",
      }, { status: 429, headers: { "cache-control": "no-store" } });
    }

    for (const root of roots) {
      const governancePreset = tavilySearchGovernancePresetForRoot(root);
      if (cadenceMinutes < governancePreset.minCadenceMinutes) {
        return Response.json({ error: "Táto frekvencia je pre vybranú kategóriu príliš častá." }, { status: 400 });
      }
    }

    const updatedRoots: AutomationDiscoveryRoot[] = [];
    for (const root of roots) {
      let updated = await setAutomationDiscoveryRootCadence({ id: root.id, cadenceMinutes }, bindings.DB);
      if (enabled && updated?.reviewStatus !== "APPROVED") {
        const preset = tavilySearchGovernancePresetForRoot(updated ?? root);
        const governance = await getGovernanceState({ type: "DISCOVERY_ROOT", id: root.id }, bindings.DB);
        await upsertGovernanceReview({
          subject: { type: "DISCOVERY_ROOT", id: root.id },
          review: { ...preset, expectedUpdatedAt: governance.state?.updatedAt ?? null },
          actor: auth.user.email,
        }, bindings.DB);
        updated = await reviewAutomationDiscoveryRoot({
          id: root.id,
          action: "approve",
          reviewerEmail: auth.user.email,
          notes: category.mode === "DIRECT_ENTITY"
            ? "Schválené používateľom zapnutím priameho hľadania nových entít."
            : "Schválené používateľom zapnutím hľadania nových zdrojov.",
        }, bindings.DB);
      }
      updated = await setAutomationDiscoveryRootEnabled({ id: root.id, enabled }, bindings.DB);
      if (updated) updatedRoots.push(updated);
    }

    let releasedFailedCooldowns = 0;
    if (enabled && category.mode === "DIRECT_ENTITY") {
      const recovery = await releaseFailedDirectDiscoveryCooldowns({
        rootIds: updatedRoots.map((root) => root.id),
      }, bindings.DB);
      releasedFailedCooldowns = recovery.released;
    }

    // Saving an enabled DIRECT_ENTITY automation is an explicit admin retry.
    // The retry retires stale successful/empty query cooldown fingerprints, but
    // normal root/entity/global daily provider budgets remain authoritative.
    const immediateRun = enabled && (category.mode === "DIRECT_ENTITY" || !wasEnabled);
    if (immediateRun) {
      const provider = new TavilyAutomationSearchProvider({ apiKey: bindings.TAVILY_API_KEY });
      const task = Promise.allSettled(updatedRoots.map((root) => runAutomationDiscoveryRootCanary({
        rootId: root.id,
        options: { database: bindings.DB!, searchProvider: provider },
      }))).then((results) => {
        results.forEach((result, index) => {
          if (result.status === "rejected") console.error(JSON.stringify({
            event: "automation_category_immediate_discovery",
            category: slug,
            rootId: updatedRoots[index]?.id,
            result: "failed",
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          }));
        });
      });
      waitUntil(task);
    }

    return Response.json({
      enabled,
      cadenceMinutes,
      immediateRun,
      releasedFailedCooldowns,
      rootCount: updatedRoots.length,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nastavenie hľadania sa nepodarilo uložiť.";
    return Response.json({ error: message }, { status: 409 });
  }
}
