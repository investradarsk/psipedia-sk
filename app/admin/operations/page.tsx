import Link from "next/link";
import { AdminAttentionQueue } from "@/components/admin-attention-queue";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import {
  isAdminAttentionPriority,
  isAdminAttentionQueueSourceType,
  isAdminAttentionView,
  type AdminAttentionFilters,
} from "@/lib/admin-attention-queue";
import { loadAdminAttentionPage } from "@/lib/admin-attention-queue-store";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationPossibleMatchReviews } from "@/lib/data-automation-match-review";

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
    sourceType: isAdminAttentionQueueSourceType(source) ? source : "all",
    priority: isAdminAttentionPriority(priority) ? priority : "all",
    view: isAdminAttentionView(view) ? view : "active",
  };

  const cursor = first(raw.cursor) || undefined;
  const attention = await loadAdminAttentionPage({
    filters,
    cursor,
  });

  let newCandidates = 0;
  let sourceIssues = 0;
  let automationAvailable = true;
  let possibleMatches = 0;
  try {
    const [candidates, sources, possible] = await Promise.all([
      listAutomationSourceCandidates(undefined, 200),
      listAutomationSourcesAdmin(undefined, 200),
      listAutomationPossibleMatchReviews({ status: "unresolved", limit: 200 }),
    ]);
    possibleMatches = possible.length;
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
      eyebrow="Admin"
      title="Upozornenia"
      description="Veci, pri ktorých treba niečo skontrolovať, schváliť, zamietnuť alebo vyriešiť. Technické nástroje a mapové operácie sú oddelené v hlavnej navigácii."
      attentionCount={attention.summary.active}
      attentionCountPartial={attention.availability === "PARTIAL" || attention.availability === "UNAVAILABLE"}
    >
      <section className={styles.hubGrid} aria-label="Rýchly prehľad upozornení">
        <a className={`${styles.hubCard} ${attention.summary.active > 0 ? styles.hubCardPrimary : styles.hubCardGood}`} href="#centrum-pozornosti">
          <span className={styles.hubKicker}>Čaká na teba</span>
          <div className={styles.hubMetric}>
            <strong>{attention.availability === "UNAVAILABLE" ? "—" : attention.summary.active}</strong>
            <span>{attention.availability === "PARTIAL" ? "aktívnych úloh v dostupných zdrojoch" : "aktívnych úloh"}</span>
          </div>
          <h2>Aktívne upozornenia</h2>
          <p>Podnety z dopytov, moderácie, partnerov a ďalších canonical workflowov, ktoré vyžadujú ľudské rozhodnutie.</p>
          <span className={styles.hubOpen}>Prejsť na upozornenia ↓</span>
        </a>

        <Link className={`${styles.hubCard} ${newCandidates > 0 ? styles.hubCardPrimary : ""}`} href="/admin/automatizacie/zdroje#kandidati">
          <span className={styles.hubKicker}>Nové zdroje</span>
          <div className={styles.hubMetric}><strong>{automationAvailable ? newCandidates : "—"}</strong><span>na posúdenie</span></div>
          <h2>Automatizačné zdroje</h2>
          <p>Nové zdroje čakajúce na ľudské schválenie sa riešia v existujúcom automation review flow.</p>
          <span className={styles.hubOpen}>Otvoriť review →</span>
        </Link>

        <Link className={`${styles.hubCard} ${sourceIssues > 0 ? styles.hubCardPrimary : styles.hubCardGood}`} href="/admin/automatizacie">
          <span className={styles.hubKicker}>Automatizácia</span>
          <div className={styles.hubMetric}><strong>{automationAvailable ? sourceIssues : "—"}</strong><span>vyžaduje kontrolu</span></div>
          <h2>Automatizácie na kontrolu</h2>
          <p>{sourceIssues > 0 ? "Niektorý zdroj čaká na schválenie alebo hlási problém, ktorý vyžaduje zásah." : "Zdroje nehlásia problém, ktorý by od teba vyžadoval zásah."}</p>
          <span className={styles.hubOpen}>Otvoriť automatizácie →</span>
        </Link>

        <Link className={`${styles.hubCard} ${possibleMatches > 0 ? styles.hubCardPrimary : styles.hubCardGood}`} href="/admin/operations/possible-matches">
          <span className={styles.hubKicker}>Identity review</span>
          <div className={styles.hubMetric}><strong>{automationAvailable ? possibleMatches : "—"}</strong><span>POSSIBLE matches</span></div>
          <h2>Neisté zhody entít</h2>
          <p>DIRECTORY a ORGANIZATION zhody, pri ktorých musí človek rozhodnúť SAME / DIFFERENT / RELATIONSHIP / DEFER.</p>
          <span className={styles.hubOpen}>Otvoriť review →</span>
        </Link>
      </section>

      <div id="centrum-pozornosti">
        <AdminAttentionQueue
          key={JSON.stringify({ ...filters, cursor: cursor ?? "" })}
          page={attention}
          filters={filters}
        />
      </div>
    </AdminShell>
  );
}
