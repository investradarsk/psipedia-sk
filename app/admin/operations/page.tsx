import Link from "next/link";
import { env } from "cloudflare:workers";
import { loadDirectoryNotionAlerts } from "@/lib/directory-notion-sync-alerts";
import { Suspense } from "react";
import { AdminAttentionQueue } from "@/components/admin-attention-queue";
import { AdminAttentionHistorySync } from "@/components/admin-attention-history-sync";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import {
  isAdminAttentionPriority,
  isAdminAttentionQueueSourceType,
  isAdminAttentionView,
  type AdminAttentionFilters,
} from "@/lib/admin-attention-queue";
import { loadAdminAttentionPage, loadExactAdminAttentionSummary } from "@/lib/admin-attention-queue-store";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

async function AdminNotionAlertsPanel({ promise }: {
  promise: ReturnType<typeof loadDirectoryNotionAlerts>;
}) {
  // A failed Notion summary must not hold back the actionable D1 queue.
  const notionAlerts = await promise.catch(() => null);
  if (notionAlerts === null) return <p role="alert" className="admin-panel">Stav prenosu do Notion sa nepodarilo načítať. Upozornenia sa nepovažujú za vybavené.</p>;
  if (!notionAlerts.length) return null;
  return <section className="admin-panel" aria-labelledby="notion-sync-alert-title">
    <h2 id="notion-sync-alert-title">Synchronizácia Notion</h2>
    <p>Profil je uložený v administrácii, ale niektoré zmeny čakajú na potvrdenie prenosu. Zobrazujú sa tu, nie v editore profilu.</p>
    <ul>
      {notionAlerts.map(alert => (
        <li key={alert.profile_id}>
          <Link href={`/admin/adresar/${alert.profile_id}`}>{alert.name} (#{alert.profile_id})</Link>
          {" – "}{alert.direction === "NOTION_TO_ADMIN" ? "Notion → Admin" : "Admin → Notion"}
          {": "}{alert.message || "Prenos nie je potvrdený."}
        </li>
      ))}
    </ul>
  </section>;
}

async function AdminOperationsContent({
  attentionPromise,
  notionAlertsPromise,
  filters,
  cursor,
}: {
  attentionPromise: ReturnType<typeof loadAdminAttentionPage>;
  notionAlertsPromise: ReturnType<typeof loadDirectoryNotionAlerts>;
  filters: AdminAttentionFilters;
  cursor?: string;
}) {
  const attention = await attentionPromise;

  return (
    <>
      <section className={styles.hubGrid} aria-label="Rýchly prehľad upozornení">
        <a className={`${styles.hubCard} ${attention.summary.active > 0 ? styles.hubCardPrimary : styles.hubCardGood}`} href="#centrum-pozornosti">
          <span className={styles.hubKicker}>Čaká na teba</span>
          <div className={styles.hubMetric}>
            <strong>{attention.availability === "UNAVAILABLE" ? "—" : attention.summary.active}</strong>
            <span>{attention.availability === "PARTIAL" ? "aktívnych úloh v dostupných zdrojoch" : "aktívnych úloh"}</span>
          </div>
          <h2>Aktívne upozornenia</h2>
          <p>Žiadosti, moderácia, partneri a adopcie. Zobrazené sú len aktuálne úlohy, ktoré ešte treba vyriešiť.</p>
          <span className={styles.hubOpen}>Prejsť na upozornenia ↓</span>
        </a>


      </section>

      <Suspense fallback={<p role="status" className="admin-panel">Načítavam upozornenia synchronizácie…</p>}>
        <AdminNotionAlertsPanel promise={notionAlertsPromise} />
      </Suspense>
      <p className="admin-panel"><Link href="/admin/operations/overovanie-zdrojov">Overovanie zdrojov psov – výsledky denných automatických kontrol →</Link></p>

      <AdminAttentionHistorySync cursor={cursor ?? ""} />
      <div id="centrum-pozornosti">
        <AdminAttentionQueue
          key={JSON.stringify({ ...filters, cursor: cursor ?? "" })}
          page={attention}
          filters={filters}
        />
      </div>
    </>
  );
}

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

  // One canonical read for both the bell and page; stream the shell before D1 finishes.
  const attentionPromise = loadAdminAttentionPage({ filters, cursor });
  const notionAlertsPromise = loadDirectoryNotionAlerts((env as unknown as { DB?: D1Database }).DB);
  const attentionSummaryPromise = loadExactAdminAttentionSummary();

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Upozornenia"
      description="Veci, pri ktorých treba niečo skontrolovať, schváliť, zamietnuť alebo vyriešiť. Technické nástroje a mapové operácie sú oddelené v hlavnej navigácii."
      attentionSummaryPromise={attentionSummaryPromise}
    >
      <Suspense fallback={
        <div id="centrum-pozornosti" className="admin-panel" role="status" aria-busy="true">
          Načítavajú sa upozornenia…
        </div>
      }>
        <AdminOperationsContent attentionPromise={attentionPromise} notionAlertsPromise={notionAlertsPromise} filters={filters} cursor={cursor} />
      </Suspense>
    </AdminShell>
  );
}
