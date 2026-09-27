import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import {
  automationUxCategories,
  automationSourcesForCategory,
  automationCandidatesForCategory,
  automationCandidateAttentionCount,
  automationCategoryStatus,
  automationSourceAttentionCount,
} from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";

export default async function AutomationAdminPage() {
  const user = await requireAdminPageUser("/admin/automatizacie");
  let sources = [];
  let candidates = [];
  let unavailable = false;

  try {
    [sources, candidates] = await Promise.all([
      listAutomationSourcesAdmin(undefined, 200),
      listAutomationSourceCandidates(undefined, 200),
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
      actions={<><Link href="/admin/operations">Upozornenia</Link><Link href="/admin/automatizacie/zdroje">Pokročilé: všetky zdroje</Link></>}
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
            const sourceAttentionCount = automationSourceAttentionCount(categorySources);
            const attentionCount = candidateCount + sourceAttentionCount;

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
                  <span className={styles.hubKicker}>{attentionCount > 0 ? "Vyžaduje kontrolu" : status}</span>
                  {candidateCount > 0 && <span className={[styles.badge, styles.badgeWarning].join(" ")}>{candidateCount} nové zdroje</span>}
                </div>
                {attentionCount > 0 && (
                  <div className={styles.hubMetric}>
                    <strong>{attentionCount}</strong>
                    <span>na rozhodnutie</span>
                  </div>
                )}
                <h2>{category.title}</h2>
                <p>{category.description}</p>
                <p>{attentionCount > 0
                  ? [candidateCount ? candidateCount + " nové zdroje" : null, sourceAttentionCount ? sourceAttentionCount + " problémy zdrojov" : null].filter(Boolean).join(" · ")
                  : "Momentálne tu nie je nič, čo vyžaduje rozhodnutie."}</p>
                <span className={styles.hubOpen}>{attentionCount > 0 ? "Skontrolovať →" : "Otvoriť →"}</span>
              </Link>
            );
          })}
        </section>
      )}
    </AdminShell>
  );
}
