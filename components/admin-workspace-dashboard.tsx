import Link from "next/link";
import { Suspense } from "react";
import {AdminWorkspaceActivity} from "./admin-workspace-activity";
import type {WorkspaceOverview} from "@/lib/admin-workspace-feed";
import type { AdminAttentionExactSummary } from "@/lib/admin-attention-queue-store";
import { adminAttentionQueueSourceTypes, adminAttentionSourceLabels, type AdminAttentionQueueSourceType } from "@/lib/admin-attention-queue";
import { ADMIN_PROFILE_HOME } from "@/lib/admin-profile-workspace";
import { summarizeAdminAutomationReads, type AdminAutomationReadResult } from "@/lib/admin-automation-reliability";
import styles from "./admin-workspace-dashboard.module.css";

type Availability = "OK" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

const availabilityLabel: Record<Availability, string> = {
  OK: "Dostupné",
  EMPTY: "Bez položiek v tomto pohľade",
  PARTIAL: "Čiastočné údaje",
  UNAVAILABLE: "Nedostupné",
};

function attentionStatus(summary: AdminAttentionExactSummary): Availability {
  if (summary.availability === "UNAVAILABLE") return "UNAVAILABLE";
  if (summary.availability === "PARTIAL") return "PARTIAL";
  return summary.active === 0 ? "EMPTY" : "OK";
}

function sourceMetric(summary: AdminAttentionExactSummary, source: AdminAttentionQueueSourceType) {
  const value = summary.availability === "UNAVAILABLE" ? null : summary.bySource[source] ?? null;
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
    <Link prefetch={false} className={`${styles.metricCard} ${emphasized ? styles.metricCardPrimary : ""}`} href={href}>
      <div className={styles.metricTopline}>
        <span>{title}</span>
        {(status === "PARTIAL" || status === "UNAVAILABLE") && <small data-status={status}>{availabilityLabel[status]}</small>}
      </div>
      <div className={styles.metricValue}>
        <strong>{shownValue}</strong>
        <span>{valueLabel}</span>
      </div>
      <p>{description}</p>
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
    <Link prefetch={false} className={styles.queueLink} href={`/admin/operations?source=${source}`}>
      <span>
        <strong>{title}</strong>
        {metric.status === "UNAVAILABLE" && <small data-status={metric.status}>Nedostupné</small>}
      </span>
      <b>{metric.value === null ? "—" : metric.value}</b>
    </Link>
  );
}


// Render each source independently. Slow D1 readers never block unrelated cards.
type QualityRead = AdminAutomationReadResult<{ pendingProposals: number | null }>;
type AttentionPromise = Promise<AdminAttentionExactSummary>;
type QualityPromise = Promise<QualityRead>;
type ActivityPromise = Promise<WorkspaceOverview>;

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
        <p>Počet návrhov na doplnenie údajov sa nepodarilo overiť. Skúste obnoviť stránku.</p>
      </div>
      <span data-status={workspaceReliability.status}>{availabilityLabel[workspaceReliability.status]}</span>
    </section>
  ) : null;
}

async function WorkspaceAttentionMetrics({ promise }: { promise: AttentionPromise }) {
  const attention = await promise;
  const overallAttentionStatus = attentionStatus(attention);
  return (
    <>
          <MetricCard
            emphasized={overallAttentionStatus !== "UNAVAILABLE" && attention.active > 0}
            title="Neprečítané upozornenia"
            description="Otvoriť neprečítané upozornenia"
            href="/admin/operations"
            value={attention.active}
            status={overallAttentionStatus}
            valueLabel={overallAttentionStatus === "PARTIAL" ? "neprečítaných v dostupných zdrojoch" : "neprečítaných"}
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
            description="Skontrolovať návrhy na doplnenie údajov"
            href="/admin/kvalita#navrhy-na-schvalenie"
            value={quality.status === "UNAVAILABLE" ? null : quality.data.pendingProposals}
            status={quality.status}
            valueLabel="návrhov na schválenie"
          />

  );
}

const communitySources: Array<{ title: string; source: AdminAttentionQueueSourceType }> = [
  { title: "Moderácia podaní", source: "MODERATION_SUBMISSION" },
  { title: "Profilové recenzie", source: "PROFILE_REVIEW_MODERATION" },
  { title: "Tipy pre redakciu", source: "NEWS_TIP" },
  { title: "Dopyty", source: "DIRECTORY_INQUIRY" },
  { title: "Hodnotenia článkov", source: "ARTICLE_FEEDBACK" },
  { title: "Žiadosti o správu profilu", source: "PARTNER_CLAIM_REVIEW" },
];
for (const source of adminAttentionQueueSourceTypes) {
  if (!communitySources.some((entry) => entry.source === source)) {
    communitySources.push({ title: adminAttentionSourceLabels[source], source });
  }
}

function WorkspaceCommunityPending() {
  return (
    <p className={styles.communityPending} role="status" aria-busy="true">
      Načítavajú sa neprečítané upozornenia…
    </p>
  );
}

async function WorkspaceCommunityCounts({ promise }: { promise: AttentionPromise }) {
  const attention = await promise;
  const actionable = communitySources
    .filter(({ source }) => sourceMetric(attention, source).value !== 0)
    .sort((a, b) => (sourceMetric(attention, b.source).value ?? -1) - (sourceMetric(attention, a.source).value ?? -1));
  const completed = communitySources.filter(({ source }) => sourceMetric(attention, source).value === 0);

  return (
    <div className={styles.communityQueues}>
      {actionable.length > 0 && (
        <div className={styles.queueGrid} data-admin-actionable-queues>
          {actionable.map(({ title, source }) => (
            <QueueLink key={source} title={title} source={source} summary={attention} />
          ))}
        </div>
      )}
      {completed.length > 0 && (
        <details className={styles.completedQueues} data-admin-completed-queues>
          <summary>
            <span>Agendy bez neprečítaných upozornení ({completed.length})</span>
          </summary>
          <div className={styles.completedQueueLinks}>
            {completed.map(({ title, source }) => (
              <Link key={source} prefetch={false} href={`/admin/operations?source=${source}`}>
                {title}<span>0</span>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function WorkspaceCommunity({ promise }: { promise: AttentionPromise }) {
  return (
    <section aria-labelledby="admin-community-title">
      <div className={styles.sectionHeading}>
        <div>
          <span>Komunita</span>
          <h2 id="admin-community-title">Neprečítané podľa agendy</h2>
        </div>
      </div>
      <Suspense fallback={<WorkspaceCommunityPending />}>
        <WorkspaceCommunityCounts promise={promise} />
      </Suspense>
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
          <Link prefetch={false} href="/admin/operations?view=pending">Všetky nevybavené úlohy →</Link>
        </div>
        <div className={styles.priorityGrid}>
          <Suspense fallback={<PendingMetric label="Neprečítané upozornenia" />}>
            <WorkspaceAttentionMetrics promise={attentionPromise} />
          </Suspense>
          <Suspense fallback={<PendingMetric label="Kvalita údajov" />}>
            <WorkspaceQualityMetric promise={qualityPromise} />
          </Suspense>
        </div>
      </section>
      <WorkspaceCommunity promise={attentionPromise} />
      <section className={styles.panel} aria-label="Rýchla správa">
        <div className={styles.panelHeading}>
          <div>
            <h2>Najčastejšie agendy</h2>
          </div>
        </div>
        <div className={styles.quickLinks} data-admin-dashboard-shortcuts>
          <Link prefetch={false} href="/admin/clanky">Články</Link>
          <Link prefetch={false} href="/admin/recenzie">Recenzie a testy</Link>
          <Link prefetch={false} href="/admin/plemena">Plemená</Link>
          <Link prefetch={false} href={ADMIN_PROFILE_HOME}>Všetky profily</Link>
          <Link prefetch={false} href="/admin/podujatia">Podujatia</Link>
          <Link prefetch={false} href="/admin/partners">Partneri</Link>
        </div>
      </section>
      {/* Scheduling and secondary tools follow actionable queues. */}
      <Suspense fallback={<p role="status">Načítava sa plán automatizácií…</p>}>
        <WorkspaceActivityPanel promise={activityPromise} />
      </Suspense>

    </div>
  );
}
