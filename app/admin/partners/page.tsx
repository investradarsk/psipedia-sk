import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getPartnerAdminSummary, listPartnerAccountsAdmin, normalizePartnerAccountAdminFilters } from "@/lib/partner-admin-store";
import { loadPartnerPendingSummary } from "@/lib/partner-attention";
import { partnerAdminStatusLabel } from "@/lib/admin-partner-labels";
import "./partners.css";

export const dynamic = "force-dynamic";

type Search = {
  q?: string | string[]; status?: string | string[]; verified?: string | string[];
  access?: string | string[]; page?: string | string[]; pageSize?: string | string[];
};
const single = (value: string | string[] | undefined) => typeof value === "string" ? value : "";

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireAdminPageUser("/admin/partners");
  const raw = await searchParams;
  const filters = normalizePartnerAccountAdminFilters({
    q: single(raw.q), status: single(raw.status), verified: single(raw.verified),
    access: single(raw.access), page: Number(single(raw.page)), pageSize: Number(single(raw.pageSize)),
  });
  const [summary, accounts, pending] = await Promise.all([
    getPartnerAdminSummary(),
    listPartnerAccountsAdmin({
      ...filters, page: raw.page ? filters.page : undefined,
      pageSize: raw.pageSize ? filters.pageSize : undefined,
    }),
    loadPartnerPendingSummary(),
  ]);
  const pageUrl = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.verified) params.set("verified", filters.verified);
    if (filters.access) params.set("access", filters.access);
    params.set("pageSize", String(accounts.pageSize));
    params.set("page", String(page));
    return "/admin/partners?" + params.toString();
  };

  return (
    <AdminShell user={user} eyebrow="Správa partnerov" title="Partneri"
      description="Registrovaní partneri, ich žiadosti, profily a správy na jednom mieste.">
      <section className="admin-form-card admin-partner-v2-workspace" data-admin-partner-accounts>
        <div className="admin-partner-v2-heading">
          <div>
            <h2>Registrovaní partneri</h2>
            <p>Otvor partnera a pozri si jeho účet. Počty ukazujú nevybavené žiadosti a pridelené profily.</p>
          </div>
          <p className="admin-partner-v2-total" data-admin-community-metrics>
            Registrovaných: <strong>{summary.accounts}</strong>
          </p>
        </div>
        <form className="admin-partner-search admin-partner-v2-search" role="search" aria-label="Filtrovať partnerské účty" data-admin-list-filters>
          <label htmlFor="partner-q">Hľadať partnera
            <input id="partner-q" name="q" defaultValue={filters.q} maxLength={120}
              placeholder="Meno, e-mail alebo ID" />
          </label>
          <details className="admin-partner-v2-filters"
            open={Boolean(filters.status || filters.verified || filters.access)}>
            <summary>Ďalšie filtre</summary>
            <div className="admin-partner-v2-filter-grid">
              <label htmlFor="partner-status">Stav účtu
                <select id="partner-status" name="status" defaultValue={filters.status}>
                  <option value="">Všetky stavy</option>
                  <option value="PENDING_VERIFICATION">Neoverené účty</option>
                  <option value="ACTIVE">Aktívne</option>
                  <option value="SUSPENDED">Pozastavené</option>
                  <option value="DEACTIVATED">Deaktivované</option>
                </select>
              </label>
              <label htmlFor="partner-verified">Overenie e-mailu
                <select id="partner-verified" name="verified" defaultValue={filters.verified}>
                  <option value="">Každé overenie</option>
                  <option value="VERIFIED">Overené</option>
                  <option value="UNVERIFIED">Neoverené</option>
                </select>
              </label>
              <label htmlFor="partner-access">Správa profilu
                <select id="partner-access" name="access" defaultValue={filters.access}>
                  <option value="">Všetci partneri</option>
                  <option value="LINKED">S prístupom</option>
                  <option value="UNLINKED">Bez prístupu</option>
                </select>
              </label>
              <label htmlFor="partner-page-size">Na strane
                <select id="partner-page-size" name="pageSize" defaultValue={String(accounts.pageSize)}>
                  <option value="25">25 partnerov</option>
                  <option value="50">50 partnerov</option>
                  <option value="100">100 partnerov</option>
                </select>
              </label>
            </div>
          </details>
          <button type="submit">Hľadať</button>
        </form>
        <p role="status" data-admin-list-results>
          Výsledky: {accounts.total} · Strana {accounts.page} z {accounts.totalPages}
        </p>
        <div className="admin-partner-table admin-partner-v2-table" role="list" aria-label="Partnerské účty">
          <div className="admin-partner-v2-columns" aria-hidden="true">
            <span>Partner</span><span>E-mail</span><span>Žiadosti</span>
            <span>Profily</span><span>Správy</span><span>Akcia</span>
          </div>
          {accounts.items.map(a => (
            <article key={a.id} role="listitem" data-admin-partner-account={a.id}>
              <div data-label="Partner" className="admin-partner-v2-partner">
                <strong>{a.contactName || "Meno neuvedené"}</strong>
                <small>{partnerAdminStatusLabel(a.status)} · Registrovaný {new Date(a.createdAt).toLocaleDateString("sk-SK")}</small>
              </div>
              <div data-label="E-mail" className="admin-partner-v2-email">{a.email}</div>
              <div data-label="Žiadosti" className="admin-partner-v2-count">
                <strong className={a.pendingRequestCount ? "admin-partner-v2-alert" : ""}>
                  {a.pendingRequestCount}
                </strong>
              </div>
              <div data-label="Profily" className="admin-partner-v2-count">
                <strong>{a.managedProfileCount}</strong>
              </div>
              <div data-label="Správy" className="admin-partner-v2-messages">
                <strong className={a.unreadMessageCount?"admin-partner-v2-alert":""}>
                  {a.unreadMessageCount}
                </strong>
                <Link href={"/admin/partners/accounts/"+encodeURIComponent(a.id)+"?tab=spravy"}>
                  Otvoriť správy
                </Link>
              </div>
              <Link href={`/admin/partners/accounts/${a.id}`} aria-label={`Otvoriť partnera ${a.contactName || a.email}`}>
                Otvoriť
              </Link>
            </article>
          ))}
        </div>
        {accounts.items.length === 0 && (
          <p className="admin-partner-v2-empty">Nenašli sa žiadni registrovaní partneri pre zadané filtre.</p>
        )}
        <nav className="admin-partner-pagination" aria-label="Stránkovanie partnerských účtov" data-admin-list-pagination>
          {accounts.page > 1 && <Link href={pageUrl(accounts.page - 1)}>← Predchádzajúca</Link>}
          {accounts.page < accounts.totalPages && <Link href={pageUrl(accounts.page+1)}>Ďalšia →</Link>}
        </nav>
      </section>
      <section className="admin-partner-v2-legacy" data-admin-partner-attention>
        <details>
          <summary>Staršie prehľady žiadostí {pending.total > 0 ? `(${pending.total} položiek na vybavenie)` : ""}</summary>
          <p>Počas prestavby zostávajú pôvodné fronty dostupné. V kroku 3/8 ich prepojíme s detailmi partnerov.</p>
          <div className="admin-partner-pending">
            <Link href="/admin/partners/claims?status=PENDING">Prevzatia ({pending.claims})</Link>
            <Link href="/admin/partners/changes?status=active">Návrhy úprav ({pending.profileChanges})</Link>
            <Link href="/admin/partners/submissions?status=active">Nové profily ({pending.newProfiles})</Link>
            <Link href="/admin/partners/events?status=active">Podujatia ({pending.events})</Link>
            <Link href="/admin/partners/help-submissions?status=active">Pomoc psom ({pending.helpSubmissions})</Link>
            <Link href="/admin/partners/verifications?status=PENDING_VERIFICATION">Overenia ({pending.verifications})</Link>
            <Link href="/admin/partners/commercial?status=NEW">Komerčné žiadosti ({pending.commercial})</Link>
            <Link href="/admin/partners/commercial">Dohody ({pending.agreements})</Link>
          </div>
        </details>
      </section>
    </AdminShell>
  );
}
