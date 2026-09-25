import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationFindingSummaries } from "@/lib/data-automation-store";
import {
  automationUxCategories,
  automationSourcesForCategory,
  automationCategoryFindingCount,
  automationCategoryLastCheck,
  automationCategoryStatus,
} from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(date);
}

export default async function AutomationAdminPage() {
  const user = await requireAdminPageUser("/admin/automatizacie");
  let sources = [];
  let findings = [];
  let unavailable = false;
  try { [sources, findings] = await Promise.all([listAutomationSourcesAdmin(undefined, 200), listAutomationFindingSummaries(undefined, 500)]); } catch { unavailable = true; }

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Automatizácie"
      description="Čo Psipedia kontroluje automaticky. Operácie zostávajú samostatným miestom pre úlohy, ktoré vyžadujú tvoje rozhodnutie."
      actions={<><Link href="/admin/automatizacie/zdroje">Zdroje a discovery</Link><Link href="/admin/operations">Operácie</Link></>}
    >
      {unavailable ? (
        <section className="admin-panel">
          <h2>Automatizačné údaje momentálne nie sú dostupné</h2>
          <p>Kategórie zostávajú viditeľné, ale stav zdrojov sa zobrazí po sprístupnení automation schémy.</p>
          <div className={styles.hubGrid}>
            {automationUxCategories.map((category) => (
              <Link className={styles.hubCard} href={"/admin/automatizacie/" + category.slug} key={category.slug}>
                <span className={styles.hubKicker}>Čaká na nastavenie</span>
                <h2>{category.title}</h2><p>{category.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className={styles.hubGrid} aria-label="Kategórie automatizácií">
          {automationUxCategories.map((category) => {
            const categorySources = automationSourcesForCategory(sources, category.slug);
            const status = automationCategoryStatus(categorySources);
            const findingCount = automationCategoryFindingCount(findings, categorySources);
            return (
              <Link className={[styles.hubCard, status === "Problém" || findingCount > 0 ? styles.hubCardPrimary : ""].filter(Boolean).join(" ")} href={"/admin/automatizacie/" + category.slug} key={category.slug}>
                <span className={styles.hubKicker}>{status}</span>
                <div className={styles.hubMetric}><strong>{findingCount}</strong><span>na kontrolu</span></div>
                <h2>{category.title}</h2>
                <p>{categorySources.filter((source) => source.enabled).length} aktívnych zdrojov · posledná kontrola {formatDate(automationCategoryLastCheck(categorySources))}</p>
                <span className={styles.hubOpen}>Otvoriť automatizáciu →</span>
              </Link>
            );
          })}
        </section>
      )}
    </AdminShell>
  );
}
