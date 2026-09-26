import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationFindingSummaries } from "@/lib/data-automation-store";
import {
  automationUxCategories,
  automationSourcesForCategory,
  automationCandidatesForCategory,
  automationCandidateAttentionCount,
  automationCategoryFindingCount,
  automationCategoryLastCheck,
  automationCategoryStatus,
  automationSourceAttentionCount,
} from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

export default async function AutomationAdminPage() {
  const user = await requireAdminPageUser("/admin/automatizacie");
  let sources = [];
  let candidates = [];
  let findings = [];
  let unavailable = false;

  try {
    [sources, candidates, findings] = await Promise.all([
      listAutomationSourcesAdmin(undefined, 200),
      listAutomationSourceCandidates(undefined, 200),
      listAutomationFindingSummaries(undefined, 500),
    ]);
  } catch {
    unavailable = true;
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Automatizácie"
      description="Čo máš teraz skontrolovať? Otvor kategóriu a vybav nové zdroje, nálezy alebo problémové zdroje bez práce s technickými objektmi."
      actions={<><Link href="/admin/operations">Operácie</Link><Link href="/admin/automatizacie/zdroje">Pokročilé: všetky zdroje</Link></>}
    >
      {unavailable ? (
        <section className="admin-panel">
          <h2>Automatizačné údaje momentálne nie sú dostupné</h2>
          <p>Kategórie zostávajú viditeľné, ale počty a stav sa zobrazia po sprístupnení automation schémy.</p>
          <div className={styles.hubGrid}>
            {automationUxCategories.map((category) => (
              <Link className={styles.hubCard} href={"/admin/automatizacie/" + category.slug} key={category.slug}>
                <span className={styles.hubKicker}>Čaká na dáta</span>
                <h2>{category.title}</h2>
                <p>{category.description}</p>
                <span className={styles.hubOpen}>Otvoriť kategóriu →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className={styles.hubGrid} aria-label="Kategórie automatizácií">
          {automationUxCategories.map((category) => {
            const categorySources = automationSourcesForCategory(sources, category.slug);
            const categoryCandidates = automationCandidatesForCategory(candidates, category.slug);
            const status = automationCategoryStatus(categorySources);
            const candidateCount = automationCandidateAttentionCount(categoryCandidates);
            const findingCount = automationCategoryFindingCount(findings, categorySources);
            const sourceAttentionCount = automationSourceAttentionCount(categorySources);
            const attentionCount = candidateCount + findingCount + sourceAttentionCount;
            const activeSources = categorySources.filter((source) => source.enabled).length;

            return (
              <Link
                className={[
                  styles.hubCard,
                  attentionCount > 0 || status === "Problém" ? styles.hubCardPrimary : styles.hubCardGood,
                ].filter(Boolean).join(" ")}
                href={"/admin/automatizacie/" + category.slug}
                key={category.slug}
              >
                <div className={styles.hubCardTop}>
                  <span className={styles.hubKicker}>{status}</span>
                  {candidateCount > 0 && <span className={[styles.badge, styles.badgeWarning].join(" ")}>nové zdroje {candidateCount}</span>}
                </div>
                <div className={styles.hubMetric}>
                  <strong>{attentionCount}</strong>
                  <span>na kontrolu</span>
                </div>
                <h2>{category.title}</h2>
                <p>{activeSources} aktívnych zdrojov · posledná kontrola {formatDate(automationCategoryLastCheck(categorySources))}</p>
                <span className={styles.hubOpen}>Skontrolovať kategóriu →</span>
              </Link>
            );
          })}
        </section>
      )}
    </AdminShell>
  );
}
