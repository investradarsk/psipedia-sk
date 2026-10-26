import Link from "next/link";
import { Suspense } from "react";
import {AdminWorkspaceActivity} from "./admin-workspace-activity";
import type {WorkspaceFeed} from "@/lib/admin-workspace-feed";
import type { AdminAttentionExactSummary } from "@/lib/admin-attention-queue-store";
import type { AdminAttentionQueueSourceType } from "@/lib/admin-attention-queue";
import { summarizeAdminAutomationReads, type AdminAutomationReadResult } from "@/lib/admin-automation-reliability";
import type { AdminDataQualitySummary } from "@/lib/admin-dashboard-store";
import styles from "./admin-workspace-dashboard.module.css";

type Availability = "OK" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

const availabilityLabel: Record<Availability, string> = {
  OK: "Dostupné",
  EMPTY: "Bez otvorených položiek",
  PARTIAL: "Čiastočné údaje",
  UNAVAILABLE: "Nedostupné",
};

function attentionStatus(summary: AdminAttentionExactSummary): Availability {
  if (summary.availability === "UNAVAILABLE") return "UNAVAILABLE";
  if (summary.availability === "PARTIAL") return "PARTIAL";
  return summary.active === 0 ? "EMPTY" : "OK";
}

function sourceMetric(summary: AdminAttentionExactSummary, source: AdminAttentionQueueSourceType) {
  const value = summary.bySource[source];
  return {
    value,
    status: value === null ? "UNAVAILABLE" as const : value === 0 ? "EMPTY" as const : "OK" as const,
  };
}

function MetricCard({
  title,
  description,
  href,
  value,
  status,
  valueLabel,
  emphasized = false,
}: {
  title: string;
  description: string;
  href: string;
  value: number | null;
  status: Availability;
  valueLabel: string;
  emphasized?: boolean;
}) {
  const shownValue = status === "UNAVAILABLE" || value === null
    ? "—"
    : status === "PARTIAL"
      ? `${value}+`
      : String(value);

  return (
    <Link className={`${styles.metricCard} ${emphasized ? styles.metricCardPrimary : ""}`} href={href}>
      <div className={styles.metricTopline}>
        <span>{title}</span>
        <small data-status={status}>{availabilityLabel[status]}</small>
      </div>
      <div className={styles.metricValue}>
        <strong>{shownValue}</strong>
        <span>{valueLabel}</span>
      </div>
      <p>{description}</p>
      <b>Otvoriť pracovný zoznam →</b>
    </Link>
  );
}

function QueueLink({
  title,
  source,
  summary,
}: {
  title: string;
  source: AdminAttentionQueueSourceType;
  summary: AdminAttentionExactSummary;
}) {
  const metric = sourceMetric(summary, source);
  return (
    <Link className={styles.queueLink} href={`/admin/operations?source=${source}`}>
      <span>
        <strong>{title}</strong>
        <small data-status={metric.status}>{availabilityLabel[metric.status]}</small>
      </span>
      <b>{metric.value === null ? "—" : metric.value}</b>
    </Link>
  );
}


// Render each source independently. Slow D1 readers never block unrelated cards.
type QualityRead = AdminAutomationReadResult<AdminDataQualitySummary>;
type AttentionPromise = Promise<AdminAttentionExactSummary>;
type QualityPromise = Promise<QualityRead>;
type ActivityPromise = Promise<WorkspaceFeed>;

function PendingMetric({ label }: { label: string }) {
  return <div className={styles.metricCard} role="status" aria-busy="true">{label}: načítava sa…</div>;
}

async function WorkspaceActivityPanel({ promise }: { promise: ActivityPromise }) {
  const activity = await promise;
  return <AdminWorkspaceActivity initial={activity} />;
}

async function WorkspaceReliabilityPanel({ promise }: { promise: QualityPromise }) {
  const qualityRead = await promise;
  const workspaceReliability = summarizeAdminAutomationReads([qualityRead]);
  return workspaceReliability.status === "PARTIAL" || workspaceReliability.status === "UNAVAILABLE" ? (
    <section className={styles.reliabilityNotice} role="alert">
      <div>
        <strong>
          {workspaceReliability.status === "UNAVAILABLE"
            ? "Časť pracovného prehľadu sa nedá načítať."
            : "Pracovný prehľad má čiastočné údaje."}
        </strong>
        <p>Nedostupný reader sa nezobrazuje ako nula. Otvor príslušnú agendu alebo obnov stránku.</p>
      </div>
      <span data-status={workspaceReliability.status}>{availabilityLabel[workspaceReliability.status]}</span>
    </section>
  ) : null;
}

async function WorkspaceAttentionMetrics({ promise }: { promise: AttentionPromise }) {
  const attention = await promise;
  const partnerClaims = sourceMetric(attention, "PARTNER_CLAIM_REVIEW");
  const overallAttentionStatus = attentionStatus(attention);
  return (
    <>
          <MetricCard
            emphasized
            title="Aktívne upozornenia"
            description="Canonical fronty, pri ktorých je potrebné ľudské rozhodnutie alebo kontrola."
            href="/admin/operations"
            value={attention.active}
            status={overallAttentionStatus}
            valueLabel={overallAttentionStatus === "PARTIAL" ? "potvrdených v dostupných zdrojoch" : "čaká na spracovanie"}
          />
          <MetricCard
            title="Partner claims"
            description="Žiadosti partnerov o prístup alebo správu canonical profilov."
            href="/admin/operations?source=PARTNER_CLAIM_REVIEW"
            value={partnerClaims.value}
            status={partnerClaims.status}
            valueLabel="claims čaká na kontrolu"
          />

    </>
  );
}

async function WorkspaceQualityMetric({ promise }: { promise: QualityPromise }) {
  const qualityRead = await promise;
  const quality = { status: qualityRead.status, data: qualityRead.data };
  return (
          <MetricCard
            title="Kvalita údajov"
            description="Nové skutočne nájdené chýbajúce údaje z Tavily, pripravené na individuálne schválenie."
            href="/admin/kvalita"
            value={quality.status === "UNAVAILABLE" ? null : quality.data.profilesWithCoreIssues}
            status={quality.status}
            valueLabel="návrhov na schválenie"
          />

  );
}

async function WorkspaceCommunity({ promise }: { promise: AttentionPromise }) {
  const attention = await promise;
  return (
      <section aria-labelledby="admin-community-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>Komunita</span>
            <h2 id="admin-community-title">Verejné podnety a moderovanie</h2>
          </div>
          <p>Každé číslo vedie priamo na rovnakú canonical frontu s filtrom.</p>
        </div>
        <div className={styles.queueGrid}>
          <QueueLink title="Moderácia podaní" source="MODERATION_SUBMISSION" summary={attention} />
          <QueueLink title="Profilové recenzie" source="PROFILE_REVIEW_MODERATION" summary={attention} />
          <QueueLink title="Tipy pre redakciu" source="NEWS_TIP" summary={attention} />
          <QueueLink title="Návrhy úprav" source="DIRECTORY_CHANGE_REQUEST" summary={attention} />
          <QueueLink title="Dopyty" source="DIRECTORY_INQUIRY" summary={attention} />
          <QueueLink title="Hodnotenia článkov" source="ARTICLE_FEEDBACK" summary={attention} />
        </div>
      </section>


  );
}

export function AdminWorkspaceDashboard({
  attentionPromise,
  qualityPromise,
  activityPromise,
}: {
  attentionPromise: AttentionPromise;
  qualityPromise: QualityPromise;
  activityPromise: ActivityPromise;
}) {
  return (
    <div className={styles.workspace}>
      <Suspense fallback={null}>
        <WorkspaceReliabilityPanel promise={qualityPromise} />
      </Suspense>
      <section aria-labelledby="admin-priority-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>Teraz</span>
            <h2 id="admin-priority-title">Čo potrebuje pozornosť</h2>
          </div>
          <Link href="/admin/operations">Všetky upozornenia →</Link>
        </div>
        <div className={styles.priorityGrid}>
          <Suspense fallback={<><PendingMetric label="Aktívne upozornenia" /><PendingMetric label="Partner claims" /></>}>
            <WorkspaceAttentionMetrics promise={attentionPromise} />
          </Suspense>
          <Suspense fallback={<PendingMetric label="Kvalita údajov" />}>
            <WorkspaceQualityMetric promise={qualityPromise} />
          </Suspense>
        </div>
      </section>
      <Suspense fallback={<section role="status">Načítavajú sa verejné podnety…</section>}>
        <WorkspaceCommunity promise={attentionPromise} />
      </Suspense>
      <section className={styles.splitGrid} aria-label="Automatizácie a rýchla správa">
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>Automatizácie Gemini</span>
              <h2>Vyhľadávanie a plánovanie</h2>
            </div>
          </div>
          <p>Nové vyhľadávanie spravujú Automatizácie Gemini. Návrhy chýbajúcich údajov spravuje samostatná Kvalita údajov.</p>
          <div className={styles.actionRow}>
            <Link href="/admin/automatizacie-gemini">Automatizácie Gemini →</Link>
            <Link href="/admin/kvalita">Kvalita údajov →</Link>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>Správa portálu</span>
              <h2>Najčastejšie agendy</h2>
            </div>
          </div>
          <div className={styles.quickLinks}>
            <Link href="/admin/clanky">Články</Link>
            <Link href="/admin/recenzie">Recenzie a testy</Link>
            <Link href="/admin/plemena">Plemená</Link>
            <Link href="/admin/sluzby-pre-psov">Služby pre psov</Link>
            <Link href="/admin/podujatia">Podujatia</Link>
            <Link href="/admin/pomoc-psom">Pomoc psom</Link>
            <Link href="/admin/partners">Partneri</Link>
          </div>
        </article>
      </section>
      {/* Event history belongs after actionable queues and commonly used agendas. */}
      <Suspense fallback={<p role="status">Načítava sa pracovný feed…</p>}>
        <WorkspaceActivityPanel promise={activityPromise} />
      </Suspense>

    </div>
  );
}
