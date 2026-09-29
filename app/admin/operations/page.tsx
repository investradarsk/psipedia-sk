import Link from "next/link";
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
import { loadAdminAttentionPage } from "@/lib/admin-attention-queue-store";
import { requireAdminPageUser } from "@/lib/admin-auth";

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

  const automationAttention = attention.summary.bySource.AUTOMATION_ACTION;


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

        <Link
          className={`${styles.hubCard} ${typeof automationAttention === "number" && automationAttention > 0 ? styles.hubCardPrimary : automationAttention === 0 ? styles.hubCardGood : ""}`}
          href="/admin/operations?source=AUTOMATION_ACTION#centrum-pozornosti"
        >
          <span className={styles.hubKicker}>Automatizácie</span>
          <div className={styles.hubMetric}>
            <strong>{automationAttention ?? "—"}</strong>
            <span>{automationAttention === 1 ? "vec vyžaduje kontrolu" : "vecí vyžaduje kontrolu"}</span>
          </div>
          <h2>Automatizácie</h2>
          <p>Nové koncepty, návrhy zmien, zdroje a problémy automatizácií.</p>
          <span className={styles.hubOpen}>Zobraziť upozornenia →</span>
        </Link>
      </section>

      <AdminAttentionHistorySync cursor={cursor ?? ""} />
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
