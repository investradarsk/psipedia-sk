import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationFindingReview } from "@/components/admin-automation-finding-review";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { automationCanonicalAdminHref, automationCanonicalNewHref, isSafeAutomationSourceUrl } from "@/lib/data-automation";
import { getAutomationFindingDetail } from "@/lib/data-automation-store";
import { getAutomationClusterIdForFinding } from "@/lib/data-automation-cluster-admin";
import { automationCategoryForSource, automationFieldLabel, automationFindingLabel } from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Áno" : "Nie";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function entityLabel(value: string) {
  const labels: Record<string, string> = {
    EVENT: "Podujatie",
    ORGANIZATION: "Organizácia",
    DIRECTORY: "Adresár",
    ADOPTION: "Adopcia",
    FOSTER: "Dočasná opatera",
    LOST_FOUND: "Stratené / nájdené",
    HELP_ITEM: "Pomoc psom",
  };
  return labels[value] ?? value;
}

function reviewLabel(value: string) {
  const labels: Record<string, string> = {
    NEW: "Nové",
    IN_REVIEW: "Kontroluje sa",
    APPROVED: "Schválené",
    REJECTED: "Zamietnuté",
    IGNORED: "Ignorované",
    SUPPRESSED: "Odložené",
    RESOLVED: "Vybavené",
  };
  return labels[value] ?? value;
}

export default async function AutomationFindingPage({ params }: Props) {
  const rawId = (await params).id;
  const user = await requireAdminPageUser("/admin/operations/automation/" + rawId);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const finding = await getAutomationFindingDetail(id);
  if (!finding) notFound();

  const canonicalHref = automationCanonicalAdminHref(finding.entityType, finding.canonicalEntityId);
  const newCanonicalHref = !canonicalHref && finding.reviewStatus === "APPROVED" ? automationCanonicalNewHref(finding.entityType) : null;
  const safeSourceHref = finding.sourceUrl && isSafeAutomationSourceUrl(finding.sourceUrl) ? finding.sourceUrl : null;
  const differences = Object.entries(finding.diff);
  const clusterId = await getAutomationClusterIdForFinding(finding.id);
  const categorySlug = automationCategoryForSource({ entityType: finding.entityType, sourceKey: finding.sourceKey, label: finding.sourceLabel, sourceUrl: finding.sourceUrl });

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title={entityLabel(finding.entityType) + " · " + automationFindingLabel(finding.findingType)}
      description="Automatizácia niečo našla. Skontroluj zdroj a navrhovanú zmenu; nič sa nezmení bez tvojho rozhodnutia."
      actions={<Link href="/admin/operations">← Späť na úlohy</Link>}
    >
      <section className={styles.statusHero}>
        <div>
          <strong>{finding.reason}</strong>
          <p>Nájdené {formatDate(finding.lastDetectedAt)} zo zdroja {finding.sourceLabel}.</p>
        </div>
        <div className={styles.badges}>
          <span className={[styles.badge, finding.priority === "HIGH" ? styles.badgeDanger : finding.priority === "MEDIUM" ? styles.badgeWarning : ""].filter(Boolean).join(" ")}>{finding.priority}</span>
          <span className={styles.badge}>{reviewLabel(finding.reviewStatus)}</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Čo sa má zmeniť</h2>
            <p>Porovnaj aktuálne údaje s návrhom zo zdroja. Ak to sedí, zmenu môžeš schváliť nižšie.</p>
          </div>
          <span className={styles.sectionCount}>{differences.length}</span>
        </div>

        {differences.length ? (
          <div className="admin-change-table" role="table">
            <div className="is-heading" role="row"><strong>Pole</strong><strong>Teraz</strong><strong>Návrh</strong></div>
            {differences.map(([field, change]) => (
              <div role="row" key={field}>
                <strong>{automationFieldLabel(field)}</strong>
                <span>{valueText(change.before)}</span>
                <span>{valueText(change.after)}</span>
              </div>
            ))}
          </div>
        ) : <div className={styles.empty}>Táto položka nemá zmenu konkrétnych polí.</div>}

        <div className={styles.quickActions} style={{ marginTop: 16 }}>
          {safeSourceHref && <a href={safeSourceHref} target="_blank" rel="noreferrer">Otvoriť pôvodný zdroj ↗</a>}
          {clusterId && categorySlug && <Link href={"/admin/automatizacie/" + categorySlug + "/cluster/" + clusterId}>Zobraziť kontext logickej entity</Link>}
          {canonicalHref && <Link href={canonicalHref}>Otvoriť záznam v Psipedii</Link>}
          {newCanonicalHref && <Link href={newCanonicalHref}>Otvoriť nový koncept</Link>}
        </div>
      </section>

      <AdminAutomationFindingReview finding={finding} />

      <details className={styles.advanced}>
        <summary>Technické údaje a provenance</summary>
        <div className={styles.advancedBody}>
          <dl>
            <div><dt>Zdroj</dt><dd>{finding.sourceLabel} <small>({finding.sourceKey})</small></dd></div>
            <div><dt>Prvýkrát zistené</dt><dd>{formatDate(finding.firstDetectedAt)}</dd></div>
            <div><dt>Naposledy videné</dt><dd>{formatDate(finding.lastDetectedAt)}</dd></div>
            <div><dt>Source timestamp</dt><dd>{formatDate(finding.sourceTimestamp)}</dd></div>
            <div><dt>Match</dt><dd>{finding.matchQuality}</dd></div>
            <div><dt>Observation</dt><dd>{finding.observationId ? "#" + finding.observationId : "—"}</dd></div>
            <div><dt>Payload hash</dt><dd><code>{finding.payloadHash}</code></dd></div>
            <div><dt>Fingerprint</dt><dd><code>{finding.fingerprint}</code></dd></div>
          </dl>
          <details>
            <summary>Celý aktuálny snapshot</summary>
            <pre>{JSON.stringify(finding.before, null, 2)}</pre>
          </details>
          <details>
            <summary>Celý navrhovaný payload</summary>
            <pre>{JSON.stringify(finding.proposed, null, 2)}</pre>
          </details>
        </div>
      </details>
    </AdminShell>
  );
}
