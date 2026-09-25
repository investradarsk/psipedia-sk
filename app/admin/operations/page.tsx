import Link from "next/link";
import { AdminAttentionQueue } from "@/components/admin-attention-queue";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import {
  filterAdminAttentionItems,
  isAdminAttentionPriority,
  isAdminAttentionSourceType,
  isAdminAttentionView,
  summarizeAdminAttention,
  type AdminAttentionFilters,
} from "@/lib/admin-attention-queue";
import { loadAdminAttentionQueue } from "@/lib/admin-attention-queue-store";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function AdminOperationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/operations");
  const raw = await searchParams;
  const source = first(raw.source);
  const priority = first(raw.priority);
  const view = first(raw.view);
  const filters: AdminAttentionFilters = {
    sourceType: isAdminAttentionSourceType(source) ? source : "all",
    priority: isAdminAttentionPriority(priority) ? priority : "all",
    view: isAdminAttentionView(view) ? view : "active",
  };

  const allItems = await loadAdminAttentionQueue();
  const summary = summarizeAdminAttention(allItems);
  const items = filterAdminAttentionItems(allItems, filters);

  let newCandidates = 0;
  let sourceIssues = 0;
  let automationAvailable = true;
  try {
    const [candidates, sources] = await Promise.all([
      listAutomationSourceCandidates(undefined, 200),
      listAutomationSourcesAdmin(undefined, 200),
    ]);
    newCandidates = candidates.filter((candidate) => candidate.reviewStatus === "NEW").length;
    sourceIssues = sources.filter((item) =>
      item.reviewStatus === "PENDING"
      || item.lastRunStatus === "FAILED"
      || Boolean(item.lastErrorCode)
    ).length;
  } catch {
    automationAvailable = false;
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Admin Operations"
      title="Operácie"
      description="Jedno miesto pre veci, ktoré treba skontrolovať alebo rozhodnúť. Najprv rieš položky čakajúce na teba; technické nastavenia sú až v detailoch."
      attentionCount={summary.active}
      actions={<><Link href="/admin/operations/geo">Geo foundation</Link><Link href="/admin/operations/outreach">Profilový outreach</Link></>}
    >
      <section className={styles.hubGrid} aria-label="Rýchly prehľad operácií">
        <a className={`${styles.hubCard} ${summary.active > 0 ? styles.hubCardPrimary : styles.hubCardGood}`} href="#centrum-pozornosti">
          <span className={styles.hubKicker}>Čaká na teba</span>
          <div className={styles.hubMetric}><strong>{summary.active}</strong><span>aktívnych úloh</span></div>
          <h2>Centrum pozornosti</h2>
          <p>Podnety z automatizácií, dopytov a ďalších workflowov, ktoré vyžadujú rozhodnutie.</p>
          <span className={styles.hubOpen}>Prejsť na úlohy ↓</span>
        </a>

        <Link className={`${styles.hubCard} ${newCandidates > 0 ? styles.hubCardPrimary : ""}`} href="/admin/automatizacie/zdroje#kandidati">
          <span className={styles.hubKicker}>Nové zdroje</span>
          <div className={styles.hubMetric}><strong>{automationAvailable ? newCandidates : "—"}</strong><span>na posúdenie</span></div>
          <h2>Automatizačné zdroje</h2>
          <p>Nastavenie a stav zdrojov patria do samostatnej sekcie Automatizácie; tu zostáva iba ľudské rozhodovanie.</p>
          <span className={styles.hubOpen}>Otvoriť automatizácie →</span>
        </Link>

        <Link className={`${styles.hubCard} ${sourceIssues > 0 ? styles.hubCardPrimary : styles.hubCardGood}`} href="/admin/automatizacie">
          <span className={styles.hubKicker}>Automatizácia</span>
          <div className={styles.hubMetric}><strong>{automationAvailable ? sourceIssues : "—"}</strong><span>vyžaduje kontrolu</span></div>
          <h2>Automatizácie</h2>
          <p>{sourceIssues > 0 ? "Niektorý zdroj čaká na schválenie alebo hlási problém." : "Zdroje nehlásia problém, ktorý by od teba vyžadoval zásah."}</p>
          <span className={styles.hubOpen}>Otvoriť automatizácie →</span>
        </Link>
        <Link className={styles.hubCard} href="/admin/operations/geo">
          <span className={styles.hubKicker}>Geo foundation</span>
          <div className={styles.hubMetric}><strong>OFF</strong><span>full backfill</span></div>
          <h2>Lokality pre budúcu mapu</h2>
          <p>Dry-run klasifikácia, explicitná inicializácia a kontrolovaný Geoapify canary. Verejná mapa ešte nie je zapnutá.</p>
          <span className={styles.hubOpen}>Otvoriť geo operations →</span>
        </Link>
      </section>

      <div id="centrum-pozornosti">
        <AdminAttentionQueue items={items} allItems={allItems} filters={filters} />
      </div>
    </AdminShell>
  );
}
