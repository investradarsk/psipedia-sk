import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { automationCanonicalAdminHref, isSafeAutomationSourceUrl } from "@/lib/data-automation";
import { getAutomationClusterDetail } from "@/lib/data-automation-cluster-admin";
import {
  automationCategoryBySlug,
  automationFieldLabel,
  automationFindingLabel,
  automationSourceDomain,
  automationSourceRoleLabel,
} from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; id: string }> };

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(date);
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Áno" : "Nie";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function AutomationClusterPage({ params }: Props) {
  const { category: slug, id: rawId } = await params;
  const category = automationCategoryBySlug(slug);
  if (!category) notFound();
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const user = await requireAdminPageUser("/admin/automatizacie/" + slug + "/cluster/" + rawId);
  const cluster = await getAutomationClusterDetail(id);
  if (!cluster || !category.entityTypes.includes(cluster.entityType)) notFound();

  const canonicalHref = automationCanonicalAdminHref(cluster.entityType, cluster.canonicalEntityId);
  const currentEvidence = cluster.evidence.filter((item) => item.isCurrent);
  const fields = Array.from(new Set(currentEvidence.map((item) => item.fieldName)));
  const conflictByField = new Map(cluster.conflicts.filter((item) => item.status === "OPEN").map((item) => [item.fieldName, item]));
  const evidenceById = new Map(cluster.evidence.map((item) => [item.id, item]));

  return (
    <AdminShell
      user={user}
      eyebrow={"Automatizácie · " + category.title}
      title={cluster.title}
      description={cluster.sourceCount + (cluster.sourceCount === 1 ? " zdroj" : " zdroje") + " · " + cluster.observationCount + " observations · posledná zmena " + formatDate(cluster.updatedAt)}
      actions={<><Link href={"/admin/automatizacie/" + slug}>← Späť na {category.title.toLowerCase()}</Link><Link href="/admin/operations">Operácie</Link></>}
    >
      <section className={[styles.statusHero, cluster.openConflictCount ? styles.statusHeroWarning : styles.statusHeroGood].join(" ")}>
        <div>
          <strong>{cluster.canonicalEntityId ? "Napojené na canonical záznam" : "Canonical záznam ešte neexistuje"}</strong>
          <p>{cluster.openFindingCount} otvorených zmien · {cluster.openConflictCount} otvorených konfliktov · {cluster.possibleMatchCount} možných zhôd</p>
        </div>
        {canonicalHref && <Link className={styles.itemAction} href={canonicalHref}>Otvoriť {cluster.entityType === "EVENT" ? "podujatie" : "záznam"}</Link>}
      </section>

      {cluster.possibleMatches.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}><div><h2>Možná zhoda / duplicita</h2><p>Nejednoznačné zhody sa automaticky nespájajú. Rozhodnutie o potvrdení alebo odmietnutí cluster matchu zatiaľ nie je implementované.</p></div><span className={styles.sectionCount}>{cluster.possibleMatches.length}</span></div>
          <div className={styles.itemList}>{cluster.possibleMatches.map((match) => (
            <div className={styles.itemCard} key={match.observationId + ":" + match.candidateClusterId}>
              <div className={styles.itemMain}><div className={styles.itemTitle}><strong>Candidate cluster #{match.candidateClusterId}</strong><span className={styles.badgeWarning}>POSSIBLE</span></div><p>{match.matchReason}</p><p>Observation #{match.observationId} · {formatDate(match.createdAt)}</p></div>
              <Link className={styles.itemAction} href={"/admin/automatizacie/" + slug + "/cluster/" + match.candidateClusterId}>Porovnať cluster</Link>
            </div>
          ))}</div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Zlúčené údaje</h2><p>Preferovaná hodnota je výber systému založený na dostupnej evidence. Source authority je iba signál, nie garancia pravdy.</p></div><span className={styles.sectionCount}>{fields.length}</span></div>
        <div className={styles.fieldList}>{fields.map((field) => {
          const evidence = currentEvidence.filter((item) => item.fieldName === field);
          const preferred = evidence.find((item) => item.isPreferred) ?? evidence[0];
          const sourceCount = new Set(evidence.filter((item) => item.normalizedValue === preferred?.normalizedValue).map((item) => item.sourceId)).size;
          const conflict = conflictByField.get(field);
          return (
            <details className={styles.fieldCard} key={field}>
              <summary>
                <span><strong>{automationFieldLabel(field)}</strong><small>{valueText(preferred?.rawValue)}</small></span>
                <span className={styles.badges}>{sourceCount > 1 && <span className={styles.badgeGood}>potvrdené {sourceCount} zdrojmi</span>}{sourceCount === 1 && <span className={styles.badge}>1 zdroj</span>}{conflict && <span className={conflict.impact === "HIGH" ? styles.badgeDanger : styles.badgeWarning}>Konflikt</span>}</span>
              </summary>
              <div className={styles.fieldEvidence}>{evidence.map((item) => (
                <div className={styles.evidenceRow} key={item.id}>
                  <div><strong>{valueText(item.rawValue)}</strong><span>{item.sourceLabel} · {automationSourceRoleLabel(item.sourceRole)}</span></div>
                  <div><span>first seen {formatDate(item.firstSeenAt)}</span><span>last seen {formatDate(item.lastSeenAt)}</span></div>
                  <div><span>authority {item.authorityScore} · confidence {item.confidence}</span><span>observation #{item.observationId}{item.isPreferred ? " · preferované" : ""}</span></div>
                </div>
              ))}</div>
            </details>
          );
        })}</div>
      </section>

      {cluster.conflicts.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}><div><h2>Konflikty</h2><p>High-impact konflikty sú zvýraznené a nesmú pôsobiť ako bežná poznámka.</p></div><span className={styles.sectionCount}>{cluster.openConflictCount}</span></div>
          <div className={styles.itemList}>{cluster.conflicts.map((conflict) => {
            const values = currentEvidence.filter((item) => item.fieldName === conflict.fieldName);
            const selected = conflict.selectedEvidenceId ? evidenceById.get(conflict.selectedEvidenceId) : values.find((item) => item.isPreferred);
            return <div className={[styles.itemCard, conflict.impact === "HIGH" && conflict.status === "OPEN" ? styles.conflictHigh : ""].filter(Boolean).join(" ")} key={conflict.id}>
              <div className={styles.itemMain}><div className={styles.itemTitle}><strong>⚠ Konflikt: {automationFieldLabel(conflict.fieldName)}</strong><span className={conflict.status === "OPEN" ? styles.badgeDanger : styles.badgeGood}>{conflict.status === "OPEN" ? "Nevyriešené" : "Vyriešené"}</span></div>
                {values.map((item) => <p key={item.id}>{item.sourceLabel}: <strong>{valueText(item.rawValue)}</strong>{selected?.id === item.id ? " · aktuálne preferované" : ""}</p>)}
              </div>
            </div>;
          })}</div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Zdroje</h2><p>Zdroje, ktoré podporujú túto logickú entitu, a polia, ktoré z nich aktuálne používame.</p></div><span className={styles.sectionCount}>{cluster.sources.length}</span></div>
        <div className={styles.itemList}>{cluster.sources.map((source) => {
          const safeHref = source.sourceUrl && isSafeAutomationSourceUrl(source.sourceUrl) ? source.sourceUrl : null;
          return <div className={styles.itemCard} key={source.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{source.label}</strong><span className={styles.badge}>{automationSourceRoleLabel(source.sourceRole)}</span></div><p>{automationSourceDomain(source.sourceUrl)} · posledné videnie {formatDate(source.lastSeenAt)}</p><p>Používame: {source.fields.map(automationFieldLabel).join(", ") || "—"}</p></div>{safeHref && <a className={styles.itemAction} href={safeHref} target="_blank" rel="noreferrer">Otvoriť zdroj ↗</a>}</div>;
        })}</div>
      </section>

      {cluster.findings.length > 0 && <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Otvorené zmeny a nálezy</h2><p>Findings zostávajú human-action vrstvou a rozhodnutia sa robia v Operáciách.</p></div><span className={styles.sectionCount}>{cluster.findings.length}</span></div>
        <div className={styles.itemList}>{cluster.findings.map((finding) => <div className={styles.itemCard} key={finding.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{automationFindingLabel(finding.findingType)}</strong><span className={styles.badge}>{finding.sourceLabel}</span></div><p>{finding.reason}</p></div><Link className={styles.itemAction} href={"/admin/operations/automation/" + finding.id}>Skontrolovať</Link></div>)}</div>
      </section>}

      <details className={styles.advanced}><summary>Technické údaje</summary><div className={styles.advancedBody}><div className={styles.techGrid}>
        <div className={styles.techRow}><strong>Cluster</strong><span>#{cluster.id} · {cluster.entityType}</span><span>canonical ID {cluster.canonicalEntityId ?? "—"} · key {cluster.canonicalEntityKey ?? "—"}</span></div>
        <div className={styles.techRow}><strong>Observations</strong><span>{Array.from(new Set(cluster.evidence.map((item) => item.observationId))).map((value) => "#" + value).join(", ") || "—"}</span><span>{cluster.evidence.length} evidence rows</span></div>
      </div></div></details>
    </AdminShell>
  );
}
