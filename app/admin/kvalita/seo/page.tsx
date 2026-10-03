import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-data-table.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  adminSeoAgendaLabels,
  adminSeoAgendas,
  adminSeoIssueDefinitions,
  type AdminSeoAgenda,
  type AdminSeoIssueCode,
} from "@/lib/admin-seo-quality-rules";
import { loadAdminSeoQualityAudit } from "@/lib/admin-seo-quality-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function positivePage(value: string | string[] | undefined) {
  const raw = first(value);
  if (!/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function auditHref(
  current: { agenda: string; scope: string; issue: string; query: string },
  patch: Partial<{ agenda: string; scope: string; issue: string; query: string; page: number }>,
) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.agenda && next.agenda !== "all") params.set("agenda", next.agenda);
  if (next.scope && next.scope !== "all") params.set("scope", next.scope);
  if (next.issue && next.issue !== "all") params.set("issue", next.issue);
  if (next.query) params.set("q", next.query);
  if ("page" in patch && patch.page && patch.page > 1) params.set("page", String(patch.page));
  const query = params.toString();
  return `/admin/kvalita/seo${query ? `?${query}` : ""}`;
}

function severityLabel(value: string) {
  if (value === "error") return "Kritické";
  if (value === "warning") return "Kvalita";
  return "Custom SEO";
}

function scopeLabel(value: string) {
  if (value === "custom") return "custom";
  if (value === "metadata") return "metadata";
  if (value === "indexing") return "indexácia";
  if (value === "discovery") return "discovery";
  return "obsah";
}

export default async function AdminSeoQualityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireAdminPageUser("/admin/kvalita/seo");
  const raw = await searchParams;
  const requestedAgenda = first(raw.agenda);
  const requestedScope = first(raw.scope);
  const requestedIssue = first(raw.issue);
  const report = await loadAdminSeoQualityAudit({
    agenda: (requestedAgenda || "all") as AdminSeoAgenda | "all",
    scope: requestedScope === "quality" || requestedScope === "custom" ? requestedScope : "all",
    issue: (requestedIssue || "all") as AdminSeoIssueCode | "all",
    query: first(raw.q),
    page: positivePage(raw.page),
  });
  const filterState = {
    agenda: report.filters.agenda,
    scope: report.filters.scope,
    issue: report.filters.issue,
    query: report.filters.query,
  };

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Kvalita údajov"
      title="SEO quality audit"
      description="Read-only inbox publikovaných canonical entít. Oddeľuje chýbajúce custom SEO od reálne slabej výslednej metadata, obsahu, indexácie a crawlability."
      actions={<Link href="/admin/kvalita">Späť na kvalitu údajov</Link>}
    >
      <section className="admin-stats" aria-label="SEO quality súhrn">
        <div><span>Publikované canonical entity</span><strong>{report.entityCount}</strong></div>
        <div><span>Reálny quality problém</span><strong>{report.entitiesWithQualityFindings}</strong></div>
        <div><span>Chýba custom SEO</span><strong>{report.entitiesWithCustomGaps}</strong></div>
        <div><span>Explicitný noindex</span><strong>{report.explicitNoindex}</strong></div>
      </section>

      <section className="admin-panel">
        <h2>Pokrytie podľa agendy</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Agenda</th>
                <th>Publikované</th>
                <th>Quality problém</th>
                <th>Custom SEO chýba</th>
                <th>Nálezy</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adminSeoAgendas.map((agenda) => {
                const counts = report.agendaCounts[agenda];
                return (
                  <tr key={agenda}>
                    <td><strong>{adminSeoAgendaLabels[agenda]}</strong></td>
                    <td>{counts.entities}</td>
                    <td>{counts.qualityEntities}</td>
                    <td>{counts.customGapEntities}</td>
                    <td>{counts.findings}</td>
                    <td>
                      <Link className={styles.edit} href={auditHref(filterState, { agenda, page: 1 })}>
                        Zobraziť →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel">
        <form className="admin-toolbar" method="get" action="/admin/kvalita/seo">
          <label className="admin-search">
            <span aria-hidden="true">⌕</span>
            <input name="q" type="search" defaultValue={report.filters.query} placeholder="Názov, slug, mesto alebo kategória" />
          </label>
          <label className="admin-select-filter">
            <span>Agenda</span>
            <select name="agenda" defaultValue={report.filters.agenda}>
              <option value="all">Všetky agendy</option>
              {adminSeoAgendas.map((agenda) => <option key={agenda} value={agenda}>{adminSeoAgendaLabels[agenda]}</option>)}
            </select>
          </label>
          <label className="admin-select-filter">
            <span>Typ</span>
            <select name="scope" defaultValue={report.filters.scope}>
              <option value="all">Všetky nálezy</option>
              <option value="quality">Výsledná kvalita</option>
              <option value="custom">Iba chýbajúce custom SEO</option>
            </select>
          </label>
          <label className="admin-select-filter">
            <span>Problém</span>
            <select name="issue" defaultValue={report.filters.issue}>
              <option value="all">Všetky problémy</option>
              {adminSeoIssueDefinitions.map((issue) => <option key={issue.code} value={issue.code}>{issue.label}</option>)}
            </select>
          </label>
          <button type="submit">Filtrovať</button>
          <Link href="/admin/kvalita/seo">Vyčistiť filtre</Link>
        </form>
        <p>
          Nájdené entity: <strong>{report.resultCount}</strong>. Prázdny custom title/description je informačný nález,
          nie automatická SEO chyba. Audit nič neopravuje ani nemení publikačný stav.
        </p>
      </section>

      <section className="admin-panel" aria-label="SEO quality inbox">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Entita</th>
                <th>Agenda</th>
                <th>SEO / obsah nálezy</th>
                <th>Canonical parent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={`${item.entity.agenda}:${item.entity.id}`}>
                  <td>
                    <div className={styles.rowTitle}>
                      <strong>{item.entity.title || "(bez názvu)"}</strong>
                      <small>{item.entity.slug || "(bez slugu)"}</small>
                    </div>
                  </td>
                  <td><span className={styles.type}>{adminSeoAgendaLabels[item.entity.agenda]}</span></td>
                  <td>
                    {item.findings.map((finding) => (
                      <div key={finding.code}>
                        <strong>{finding.label}</strong>{" "}
                        <small>· {severityLabel(finding.severity)} · {scopeLabel(finding.scope)}</small>
                        <div><small>{finding.detail}</small></div>
                      </div>
                    ))}
                  </td>
                  <td>
                    <small>
                      Canonical: {item.entity.expectedCanonicalPath}<br />
                      Parent: {item.entity.parentPath ?? "nezistený"}
                    </small>
                  </td>
                  <td><Link className={styles.edit} href={item.entity.adminHref}>Spravovať →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.items.length === 0 ? <p>Pre zvolené filtre nie sú žiadne SEO quality nálezy.</p> : null}
      </section>

      {report.pagination.totalPages > 1 ? (
        <nav className="admin-pagination" aria-label="Stránkovanie SEO quality auditu">
          {report.pagination.page > 1
            ? <Link href={auditHref(filterState, { page: report.pagination.page - 1 })}>← Predchádzajúca</Link>
            : <span aria-disabled="true">← Predchádzajúca</span>}
          <span>Strana {report.pagination.page} z {report.pagination.totalPages}</span>
          {report.pagination.page < report.pagination.totalPages
            ? <Link href={auditHref(filterState, { page: report.pagination.page + 1 })}>Ďalšia →</Link>
            : <span aria-disabled="true">Ďalšia →</span>}
        </nav>
      ) : null}

      <p><small>Audit vygenerovaný: {new Date(report.generatedAt).toLocaleString("sk-SK", { timeZone: "Europe/Bratislava" })}</small></p>
    </AdminShell>
  );
}
