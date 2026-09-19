"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminActionButton } from "@/components/admin-interaction-system";
import { AdminPagination } from "@/components/admin-pagination";
import { SearchIcon } from "@/components/icons";
import { organizationAdminHref, type OrganizationAdminFilters } from "@/lib/help-organization-admin-query";
import type { OrganizationAdminPage, OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import type { OrganizationPublicationAction } from "@/lib/help-organization-admin-write";
import { organizationPublicationTypes } from "@/lib/help-organization-publication";
import styles from "./admin-organization-publication.module.css";

const statusLabels = {
  DRAFT: "Koncept",
  PUBLISHED: "Publikované",
  ARCHIVED: "Archivované",
} as const;

const typeLabels: Record<string, string> = {
  SHELTER: "Útulok",
  CIVIC_ASSOCIATION: "Občianske združenie",
  RESCUE_ORGANIZATION: "Záchranná organizácia",
  MUNICIPAL_ORGANIZATION: "Mestská/obecná organizácia",
  NONPROFIT: "Nezisková organizácia",
  OTHER: "Iné",
};

function formatDate(value: string | null) {
  if (!value) return "Neznáme";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Neznáme";
  return new Intl.DateTimeFormat("sk-SK", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function actionQuestion(item: OrganizationPublicationAdminItem, action: OrganizationPublicationAction) {
  if (action === "publish") return "Publikovať organizáciu „" + item.name + "“? Verejný profil aj sitemap ju začnú považovať za publikovanú.";
  if (action === "unpublish") return "Presunúť organizáciu „" + item.name + "“ do konceptu? Verejný profil prestane byť dostupný.";
  if (action === "archive") return "Archivovať organizáciu „" + item.name + "“? Profil bude neverejný a organization editor bude iba na čítanie.";
  return "Obnoviť organizáciu „" + item.name + "“ do konceptu? Obnovenie ju automaticky nepublikuje.";
}

export function AdminOrganizationPublicationDashboard({ data, filters }: {
  data: OrganizationAdminPage;
  filters: OrganizationAdminFilters;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changePublication(item: OrganizationPublicationAdminItem, action: OrganizationPublicationAction) {
    if (!window.confirm(actionQuestion(item, action))) return;
    setBusyId(item.id); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/organizations/" + item.id + "/publication", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, expectedUpdatedAt: item.updatedAt }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Lifecycle zmenu sa nepodarilo uložiť.");
      setMessage(action === "publish" ? "Organizácia bola publikovaná."
        : action === "unpublish" ? "Organizácia bola presunutá do konceptu."
        : action === "archive" ? "Organizácia bola archivovaná."
        : "Organizácia bola obnovená do konceptu.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lifecycle zmenu sa nepodarilo uložiť.");
    } finally { setBusyId(null); }
  }

  return <>
    <section className="admin-stats" aria-label="Stav organizácií">
      <div><span>Všetky</span><strong>{data.counts.total}</strong></div>
      <div><span>Koncepty</span><strong>{data.counts.draft}</strong></div>
      <div><span>Publikované</span><strong>{data.counts.published}</strong></div>
      <div><span>Archivované</span><strong>{data.counts.archived}</strong></div>
    </section>

    <section className="admin-panel">
      <form className={styles.filters} action="/admin/organizacie" method="get" role="search">
        <label className={"admin-search " + styles.search}>
          <SearchIcon size={19} /><span>Hľadať</span>
          <input name="q" defaultValue={filters.q} maxLength={120} placeholder="Názov, slug, mesto, okres, e-mail…" />
        </label>
        <label className="admin-select-filter"><span>Typ</span><select name="type" defaultValue={filters.type}><option value="">Všetky typy</option>{organizationPublicationTypes.map((type) => <option key={type} value={type}>{typeLabels[type] ?? type}</option>)}</select></label>
        <label className="admin-select-filter"><span>Stav</span><select name="status" defaultValue={filters.status}><option value="all">Všetky stavy</option><option value="DRAFT">Koncept</option><option value="PUBLISHED">Publikované</option><option value="ARCHIVED">Archivované</option></select></label>
        <label className="admin-select-filter"><span>Kraj</span><select name="region" defaultValue={filters.region}><option value="">Všetky kraje</option>{data.options.regions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="admin-select-filter"><span>Okres</span><select name="district" defaultValue={filters.district}><option value="">Všetky okresy</option>{data.options.districts.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="admin-select-filter"><span>Mesto</span><select name="city" defaultValue={filters.city}><option value="">Všetky mestá</option>{data.options.cities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" name="missingLocation" value="1" defaultChecked={filters.missingLocation} /> Bez lokality</label>
        <label className={styles.check}><input type="checkbox" name="incomplete" value="1" defaultChecked={filters.incomplete} /> Neúplný profil</label>
        <div className={styles.filterActions}><AdminActionButton variant="primary" type="submit">Použiť filtre</AdminActionButton><Link className={styles.clearFilters} href="/admin/organizacie">Vyčistiť</Link></div>
      </form>

      {message && <p className={styles.message} role="status">{message}</p>}
      {error && <p className={styles.message + " " + styles.error} role="alert">{error}</p>}
      <p className="admin-help-results">Nájdené: <strong>{data.resultCount}</strong> · Strana {data.pagination.page} z {data.pagination.totalPages}</p>

      <div className={styles.list}>
        {data.items.map((item) => {
          const location = [item.primaryCity, item.primaryDistrict, item.primaryRegion].filter(Boolean).join(" · ") || "Bez lokality";
          const isPublic = item.status === "PUBLISHED" && Boolean(item.publishedAt) && !item.archivedAt;
          return <article className={styles.row} key={item.id}>
            <div className={styles.thumb}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span aria-hidden="true">🐾</span>}</div>
            <div className={styles.main}>
              <div className="admin-article-tags">
                <span className={"admin-status admin-status--" + (item.status === "PUBLISHED" ? "published" : "draft")}>{statusLabels[item.status]}</span>
                <span>{typeLabels[item.type] ?? item.type}</span>
                <span>{location}</span>
                <span>{isPublic ? "Verejný profil" : "Neverejný profil"}</span>
                <span>{item.preflight.ready ? "Publication READY" : "Publication BLOCKED"}</span>
              </div>
              <h2><Link href={"/admin/organizacie/" + item.id}>{item.name || "Bez názvu"}</Link></h2>
              <p>{item.shortDescription || item.description || "Bez verejného popisu"}</p>
              <p className={styles.meta}>#{item.id} · /organizacie/{item.slug || "—"} · lokality {item.locationCount} · fundraising {item.fundraisingCount} · aktualizované {formatDate(item.updatedAt)}</p>
              {item.completenessHints.length ? <div className={styles.hints} aria-label="Chýbajúce údaje">{item.completenessHints.map((hint) => <span key={hint}>{hint}</span>)}</div> : <div className={styles.hints}><span>Profil bez deterministických medzier</span></div>}
              {!item.preflight.ready && <p className={styles.preflight}><strong>Publication BLOCKED:</strong> {item.preflight.blockers.map((blocker) => blocker.message).join(" ")}</p>}
            </div>
            <div className={styles.actions}>
              {isPublic && <Link href={"/organizacie/" + item.slug} target="_blank">Pozrieť ↗</Link>}
              <Link className="admin-row-edit" href={"/admin/organizacie/" + item.id}>Spravovať</Link>
              <Link href={"/admin/organizacie/" + item.id + "#fundraising"}>Fundraising</Link>
              {item.status === "DRAFT" && <AdminActionButton variant="primary" disabled={!item.preflight.ready || busyId !== null} onClick={() => void changePublication(item, "publish")}>Publikovať</AdminActionButton>}
              {item.status === "PUBLISHED" && <AdminActionButton variant="secondary" disabled={busyId !== null} onClick={() => void changePublication(item, "unpublish")}>Presunúť do konceptu</AdminActionButton>}
              {item.status !== "ARCHIVED" && <AdminActionButton variant="destructive" disabled={busyId !== null} onClick={() => void changePublication(item, "archive")}>Archivovať</AdminActionButton>}
              {item.status === "ARCHIVED" && <AdminActionButton variant="secondary" disabled={busyId !== null} onClick={() => void changePublication(item, "restore")}>Obnoviť do konceptu</AdminActionButton>}
            </div>
          </article>;
        })}
        {!data.items.length && <div className="admin-empty"><span>🐾</span><h2>Žiadne organizácie</h2><p>Zmeň filtre alebo vytvor nový canonical záznam.</p></div>}
      </div>
      <AdminPagination pagination={data.pagination} basePath={organizationAdminHref({ ...filters, page: 1 })} />
    </section>
  </>;
}
