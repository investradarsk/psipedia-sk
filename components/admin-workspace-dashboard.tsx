import Link from "next/link";
import type { AdminAttentionExactSummary } from "@/lib/admin-attention-queue-store";
import type { AdminAttentionQueueSourceType } from "@/lib/admin-attention-queue";
import type { AdminAutomationReliabilitySummary } from "@/lib/admin-automation-reliability";
import type { AdminDataQualitySummary } from "@/lib/admin-dashboard-store";
import styles from "./admin-workspace-dashboard.module.css";

type Availability = "OK" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

type ReadMetric = {
  status: "OK" | "EMPTY" | "UNAVAILABLE";
  value: number;
};

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

export function AdminWorkspaceDashboard({
  attention,
  automationLifecycle,
  quality,
  workspaceReliability,
}: {
  attention: AdminAttentionExactSummary;
  automationLifecycle: ReadMetric;
  quality: {
    status: "OK" | "EMPTY" | "UNAVAILABLE";
    data: AdminDataQualitySummary;
  };
  workspaceReliability: AdminAutomationReliabilitySummary;
}) {
  const automationAttention = sourceMetric(attention, "AUTOMATION_ACTION");
  const partnerClaims = sourceMetric(attention, "PARTNER_CLAIM_REVIEW");
  const overallAttentionStatus = attentionStatus(attention);

  return (
    <div className={styles.workspace}>
      {workspaceReliability.status === "PARTIAL" || workspaceReliability.status === "UNAVAILABLE" ? (
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
      ) : null}

      <section aria-labelledby="admin-priority-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>Teraz</span>
            <h2 id="admin-priority-title">Čo potrebuje pozornosť</h2>
          </div>
          <Link href="/admin/operations">Všetky upozornenia →</Link>
        </div>
        <div className={styles.priorityGrid}>
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
            title="Automatizácie na kontrolu"
            description="Nové zdroje, návrhy zmien a ďalšie automatizačné akcie pripravené na rozhodnutie."
            href="/admin/operations?source=AUTOMATION_ACTION"
            value={automationAttention.value}
            status={automationAttention.status}
            valueLabel="automatizačných akcií"
          />
          <MetricCard
            title="Partner claims"
            description="Žiadosti partnerov o prístup alebo správu canonical profilov."
            href="/admin/operations?source=PARTNER_CLAIM_REVIEW"
            value={partnerClaims.value}
            status={partnerClaims.status}
            valueLabel="claims čaká na kontrolu"
          />
          <MetricCard
            title="Kvalita údajov"
            description={quality.data.mediaIssues > 0
              ? `Jadrové údaje profilov; navyše ${quality.data.mediaIssues} problémov monitoringu obrázkov.`
              : "Profily s chýbajúcim popisom, obrázkom alebo potvrdenou adresou."}
            href="/admin/kvalita"
            value={quality.status === "UNAVAILABLE" ? null : quality.data.profilesWithCoreIssues}
            status={quality.status}
            valueLabel="profilov s jadrovým nedostatkom"
          />
        </div>
      </section>

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

      <section className={styles.splitGrid} aria-label="Automatizácie a rýchla správa">
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>Automatizácie</span>
              <h2>Stav workflowov</h2>
            </div>
            <small data-status={automationLifecycle.status}>{availabilityLabel[automationLifecycle.status]}</small>
          </div>
          <p>Prehľad používa existujúci reliability contract. Chyba načítania sa nikdy nemení na falošnú nulu.</p>
          <Link className={styles.inlineMetric} href="/admin/automatizacie/zmeny-stavu">
            <span>Otvorené návrhy zmien stavu</span>
            <strong>{automationLifecycle.status === "UNAVAILABLE" ? "—" : automationLifecycle.value}</strong>
          </Link>
          <div className={styles.actionRow}>
            <Link href="/admin/automatizacie">Automatizácie →</Link>
            <Link href="/admin/automatizacie/prehlad">Prevádzkový prehľad →</Link>
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
    </div>
  );
}
