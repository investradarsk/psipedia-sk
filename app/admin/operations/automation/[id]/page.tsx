import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationFindingReview } from "@/components/admin-automation-finding-review";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { automationCanonicalAdminHref, automationCanonicalNewHref, isSafeAutomationSourceUrl } from "@/lib/data-automation";
import { getAutomationFindingDetail } from "@/lib/data-automation-store";

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

export default async function AutomationFindingPage({ params }: Props) {
  const rawId = (await params).id;
  const user = await requireAdminPageUser(`/admin/operations/automation/${rawId}`);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const finding = await getAutomationFindingDetail(id);
  if (!finding) notFound();

  const canonicalHref = automationCanonicalAdminHref(finding.entityType, finding.canonicalEntityId);
  const newCanonicalHref = !canonicalHref && finding.reviewStatus === "APPROVED" ? automationCanonicalNewHref(finding.entityType) : null;
  const safeSourceHref = finding.sourceUrl && isSafeAutomationSourceUrl(finding.sourceUrl) ? finding.sourceUrl : null;
  const differences = Object.entries(finding.diff);

  return (
    <AdminShell
      user={user}
      eyebrow="Automatický research"
      title={`${finding.entityType}: ${finding.findingType}`}
      description="Finding je návrh na ručné posúdenie. Automatizácia nemení ani nepublikuje canonical obsah."
      actions={<Link href="/admin/operations/automation">Stav automatizácie</Link>}
    >
      <section className="admin-stats" aria-label="Finding metadata">
        <div><span>Priorita</span><strong>{finding.priority}</strong></div>
        <div><span>Review</span><strong>{finding.reviewStatus}</strong></div>
        <div><span>Match</span><strong>{finding.matchQuality}</strong></div>
        <div><span>Observation</span><strong>{finding.observationId ? `#${finding.observationId}` : "—"}</strong></div>
      </section>

      <section className="admin-panel">
        <h2>Provenance</h2>
        <dl>
          <div><dt>Zdroj</dt><dd>{finding.sourceLabel} <small>({finding.sourceKey})</small></dd></div>
          <div><dt>Zistené</dt><dd>{formatDate(finding.firstDetectedAt)}</dd></div>
          <div><dt>Naposledy videné</dt><dd>{formatDate(finding.lastDetectedAt)}</dd></div>
          <div><dt>Source timestamp</dt><dd>{formatDate(finding.sourceTimestamp)}</dd></div>
          <div><dt>Payload hash</dt><dd><code>{finding.payloadHash}</code></dd></div>
          <div><dt>Fingerprint</dt><dd><code>{finding.fingerprint}</code></dd></div>
        </dl>
        <p>{finding.reason}</p>
        <div className="admin-form-actions">
          {safeSourceHref && <a href={safeSourceHref} target="_blank" rel="noreferrer">Otvoriť verejný zdroj ↗</a>}
          {canonicalHref && <Link href={canonicalHref}>Otvoriť canonical záznam</Link>}
          {newCanonicalHref && <Link href={newCanonicalHref}>Vytvoriť canonical koncept</Link>}
        </div>
      </section>

      <section className="admin-panel">
        <h2>Before → proposed after</h2>
        {differences.length ? (
          <div className="admin-change-table" role="table">
            <div className="is-heading" role="row"><strong>Pole</strong><strong>Before</strong><strong>Proposed</strong></div>
            {differences.map(([field, change]) => (
              <div role="row" key={field}>
                <strong>{field}</strong>
                <span>{valueText(change.before)}</span>
                <span>{valueText(change.after)}</span>
              </div>
            ))}
          </div>
        ) : <p>Finding neobsahuje field-level diff.</p>}
        <details>
          <summary>Celý canonical snapshot</summary>
          <pre>{JSON.stringify(finding.before, null, 2)}</pre>
        </details>
        <details>
          <summary>Celý navrhovaný payload</summary>
          <pre>{JSON.stringify(finding.proposed, null, 2)}</pre>
        </details>
      </section>

      <AdminAutomationFindingReview finding={finding} />
    </AdminShell>
  );
}
