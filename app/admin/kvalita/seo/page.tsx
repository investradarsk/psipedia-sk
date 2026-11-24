import { AdminQualityWorkspaceTabs } from "@/components/admin-quality-workspace-tabs";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-data-table.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  adminSeoAgendaLabels,
  adminSeoAgendas,
  adminSeoIssueDefinitions,
  isSeoMetadataIssue,
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

function altModeLabel(value: string) {
  if (value === "stored") return "uložený ALT";
  if (value === "derived-public") return "verejný rendering";
  if (value === "decorative") return 'dekoratívny alt=""';
  return "samostatný ALT nepodporovaný";
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
    agenda: (requestedAgenda || "profiles") as AdminSeoAgenda | "all" | "profiles",
    scope: requestedScope === "quality" || requestedScope === "custom" || requestedScope === "all" ? requestedScope : "metadata",
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
      title="SEO metadáta profilov"
      description="Kontrola SEO titulkov, meta popisov, ALT, canonical a indexačných nastavení publikovaných profilov. Bez automatických zápisov."
      actions={<Link href="/admin/kvalita">Späť na kvalitu údajov</Link>}
    >
      <AdminQualityWorkspaceTabs active="seo" />
      <section className="admin-stats" aria-label="SEO quality súhrn">
        <div><span>Publikované v zvolenej oblasti</span><strong>{report.filteredEntityCount}</strong></div>
        <div><span>SEO nálezy na kontrolu</span><strong>{report.resultCount}</strong></div>
        <div><span>Chýbajúce vlastné SEO</span><strong>{report.filteredCustomGapEntities}</strong></div>
        <div><span>Všetky publikované záznamy webu</span><strong>{report.entityCount}</strong></div>
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
        <h2>SEO nálezy podľa typu</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Kontrola</th><th>Počet entít</th><th></th></tr>
            </thead>
            <tbody>
              {adminSeoIssueDefinitions.filter((issue) => report.filters.scope !== "metadata" || isSeoMetadataIssue(issue.code)).map((issue) => (
                <tr key={issue.code}>
                  <td>{issue.label}</td>
                  <td><strong>{report.filteredIssueCounts[issue.code]}</strong></td>
                  <td>
                    <Link className={styles.edit} href={auditHref(filterState, { issue: issue.code, page: 1 })}>
                      Zobraziť →
                    </Link>
                  </td>
                </tr>
              ))}
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
              <option value="profiles">Všetky profily</option>
              <option value="all">Celý web vrátane článkov a podujatí</option>
              {adminSeoAgendas.map((agenda) => <option key={agenda} value={agenda}>{adminSeoAgendaLabels[agenda]}</option>)}
            </select>
          </label>
          <label className="admin-select-filter">
            <span>Typ</span>
            <select name="scope" defaultValue={report.filters.scope}>
              <option value="metadata">SEO polia a metadáta</option>
              <option value="custom">Len chýbajúce vlastné SEO polia</option>
              <option value="all">Všetky kontroly</option>
              <option value="quality">Rozšírená kvalita obsahu</option>
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
          Profily s nálezmi: <strong>{report.resultCount}</strong>. Vlastné SEO polia sa vyžadujú iba tam, kde ich editor podporuje.
          Adopcie, stratené a nájdené psy a organizácie zatiaľ používajú automaticky generované metadáta;
          pri nich kontrolujeme výsledný titulok a meta popis. Audit nič neopravuje.
        </p>
      </section>

      <section className="admin-panel" aria-label="SEO quality inbox">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Entita</th>
                <th>Agenda</th>
                <th>Chýbajúce SEO údaje a upozornenia</th>
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
                      <small>{item.entity.customSeoSupported ? "Vlastné SEO polia" : "Automatické SEO metadáta"}</small>
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
                      Parent: {item.entity.parentPath ?? "nezistený"}<br />
                      ALT: {altModeLabel(item.entity.imageAltMode)} · {item.entity.imageAltSource}
                    </small>
                  </td>
                  <td><Link className={styles.edit} href={item.entity.adminHref}>Spravovať →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.items.length === 0 ? <p>Pre zvolené filtre nie sú žiadne chýbajúce SEO údaje alebo upozornenia.</p> : null}
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

      <p><small>Audit D1 prepočítaný: {new Date(report.generatedAt).toLocaleString("sk-SK", { timeZone: "Europe/Bratislava" })}. Ide o aktuálne uložené publikované údaje Psipedia, nie o živé overenie indexácie v Google.</small></p>
    </AdminShell>
  );
}
