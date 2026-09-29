import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationAvailabilityState } from "./_components/automation-availability-state";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  automationCandidatesForCategory,
  automationSourcesForCategory,
  automationUxCategories,
} from "@/lib/admin-automation-presentation";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { countOpenAutomationLifecycleSuggestions } from "@/lib/data-automation-lifecycle-store";
import { readAdminAutomationData, summarizeAdminAutomationReads } from "@/lib/admin-automation-reliability";

export const dynamic = "force-dynamic";

export default async function AutomationAdminPage() {
  const user = await requireAdminPageUser("/admin/automatizacie");
  const [sourcesRead, candidatesRead, lifecycleRead] = await Promise.all([
    readAdminAutomationData({
      key: "automation-hub:sources",
      load: () => listAutomationSourcesAdmin(undefined, 200),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
    readAdminAutomationData({
      key: "automation-hub:candidates",
      load: () => listAutomationSourceCandidates(undefined, 200),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
    readAdminAutomationData({
      key: "automation-hub:lifecycle-count",
      load: () => countOpenAutomationLifecycleSuggestions(),
      fallback: 0,
      empty: (value) => value === 0,
    }),
  ]);
  const reliability = summarizeAdminAutomationReads([sourcesRead, candidatesRead, lifecycleRead]);
  const sources = sourcesRead.data;
  const candidates = candidatesRead.data;
  const lifecycleCount = lifecycleRead.data;
  const lifecycleLabel = lifecycleRead.status === "UNAVAILABLE" ? "—" : String(lifecycleCount);

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Automatizácie"
      description="Vyber kategóriu a nastav priame hľadanie entít alebo monitoring opakovaných zdrojov. Nový obsah vzniká iba ako canonical koncept."
      actions={<><Link href="/admin/automatizacie/zmeny-stavu">Zmeny stavu · {lifecycleLabel}</Link><Link href="/admin/automatizacie/prehlad">Prehľad automatizácií →</Link></>}
    >
      <AdminAutomationAvailabilityState summary={reliability} refreshHref="/admin/automatizacie" />
      <section className={styles.hubGrid} aria-label="Kategórie automatizácií">
        {automationUxCategories.map((category) => {
          const categorySources = automationSourcesForCategory(sources, category.slug);
          const categoryCandidates = automationCandidatesForCategory(candidates, category.slug);
          const newCount = categoryCandidates.filter((candidate) => candidate.reviewStatus === "NEW" && candidate.lifecycle === "ACTIVE").length;
          const approvedCount = categorySources.filter((source) => source.reviewStatus === "APPROVED").length;
          const rejectedCount = categoryCandidates.filter((candidate) => candidate.reviewStatus === "REJECTED").length;
          return (
            <Link className={styles.hubCard} href={"/admin/automatizacie/" + category.slug} key={category.slug}>
              <h2>{category.title}</h2>
              <p>{category.description}</p>
              {category.mode === "DIRECT_ENTITY"
                ? <p>Priame vyhľadávanie entít · bez schvaľovania zdrojov</p>
                : sourcesRead.status === "UNAVAILABLE" || candidatesRead.status === "UNAVAILABLE"
                  ? <p>Údaje kategórie sú čiastočne nedostupné.</p>
                  : <p>{newCount} nových · {approvedCount} schválených · {rejectedCount} zamietnutých</p>}
              <span className={styles.hubOpen}>{category.mode === "DIRECT_ENTITY" ? "Otvoriť automatizáciu →" : "Otvoriť zdroje →"}</span>
            </Link>
          );
        })}
      </section>
    </AdminShell>
  );
}
