"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AdminBulkSelectionControls,
  BulkSelectionCheckbox,
  adminBulkSelectionStyles,
  useAdminBulkSelection,
} from "@/components/admin-bulk-selection";
import { AdminActionButton, AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";
import { AdminPagination } from "@/components/admin-pagination";
import { SearchIcon } from "@/components/icons";
import { allDirectoryCategories, directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import {
  directoryAdminHref,
  directoryAdminMembershipFilters,
  directoryAdminMembershipFingerprint,
  type DirectoryAdminFilters,
} from "@/lib/directory-admin-query";
import type { ManagedDirectoryAdminPage } from "@/lib/directory-admin-store";
import type { ManagedDirectoryProfileSummary } from "@/lib/directory-store";
import styles from "./admin-directory-dashboard.module.css";

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Neznáme"
    : new Intl.DateTimeFormat("sk-SK", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function AdminDirectoryDashboard({ data, filters }: {
  data: ManagedDirectoryAdminPage;
  filters: DirectoryAdminFilters;
}) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<ManagedDirectoryProfileSummary | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const { profiles, counts, resultCount, pagination, options } = data;
  const membershipFilter = directoryAdminMembershipFilters(filters);
  const membershipFingerprint = directoryAdminMembershipFingerprint(membershipFilter);
  const pageIds = profiles.map((profile) => profile.id);
  const bulkSelection = useAdminBulkSelection({
    module: "directory",
    membershipFingerprint,
    pageIds,
    resultCount,
    supportsAllMatching: false,
  });

  async function removeProfile(profile: ManagedDirectoryProfileSummary) {
    setDeletingId(profile.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/directory/${profile.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Profil sa nepodarilo archivovať.");
      setMessage("Profil bol archivovaný.");
      setDeleteTarget(null);
      bulkSelection.clear();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profil sa nepodarilo archivovať.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Stav adresára">
        <div><span>Všetky profily</span><strong>{counts.total}</strong></div>
        <div><span>Publikované</span><strong>{counts.published}</strong></div>
        <div><span>Koncepty</span><strong>{counts.draft}</strong></div>
        <div><span>Archivované</span><strong>{counts.archived}</strong></div>
      </section>

      <section className="admin-panel">
        <form className={`admin-directory-category-filter ${styles.filters}`} action="/admin/adresar" method="get" role="search">
          <label className={`admin-search ${styles.search}`}>
            <SearchIcon size={19} />
            <span>Hľadať</span>
            <input name="q" defaultValue={filters.q} maxLength={100} placeholder="Názov, mesto, okres alebo služba" />
          </label>
          <label className="admin-select-filter"><span>Kategória</span><select name="category" defaultValue={filters.category}><option value="">Všetky kategórie</option>{allDirectoryCategories.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}</select></label>
          <label className="admin-select-filter"><span>Stav publikácie</span><select name="status" defaultValue={filters.status}><option value="all">Všetky stavy</option><option value="published">Publikované</option><option value="draft">Koncepty</option><option value="archived">Archivované</option></select></label>
          <label className="admin-select-filter"><span>Kraj</span><select name="region" defaultValue={filters.region}><option value="">Všetky kraje</option>{options.regions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className="admin-select-filter"><span>Okres</span><select name="district" defaultValue={filters.district}><option value="">Všetky okresy</option>{options.districts.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className="admin-select-filter"><span>Mesto</span><select name="city" defaultValue={filters.city}><option value="">Všetky mestá</option>{options.cities.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className="admin-select-filter"><span>Overenie</span><select name="verification" defaultValue={filters.verification}><option value="all">Všetky</option><option value="verified">Overené</option><option value="unverified">Neoverené</option></select></label>
          <label className="admin-select-filter"><span>Obrázok</span><select name="media" defaultValue={filters.media}><option value="all">Všetky</option><option value="with-image">S obrázkom</option><option value="without-image">Bez obrázka</option></select></label>
          <div className={styles.filterActions}>
            <AdminActionButton variant="primary" type="submit">Použiť filtre</AdminActionButton>
            <Link className={styles.clearFilters} href="/admin/adresar">Vyčistiť</Link>
          </div>
        </form>

        {message && <p className="admin-flash" role="status">{message}</p>}
        <p className="admin-help-results admin-directory-results">Nájdené: <strong>{resultCount}</strong> · Strana {pagination.page} z {pagination.totalPages}</p>

        {profiles.length ? (
          <>
            <AdminBulkSelectionControls
              module="directory"
              membershipFilter={membershipFilter}
              membershipFingerprint={membershipFingerprint}
              resultCount={resultCount}
              pageIds={pageIds}
              selection={bulkSelection.selection}
              selectionReady={bulkSelection.ready}
              selectedCount={bulkSelection.selectedCount}
              currentPageSelected={bulkSelection.currentPageSelected}
              currentPageAllSelected={bulkSelection.currentPageAllSelected}
              currentPageSomeSelected={bulkSelection.currentPageSomeSelected}
              toggleCurrentPage={bulkSelection.toggleCurrentPage}
              selectAllMatching={bulkSelection.selectAllMatching}
              clear={bulkSelection.clear}
              supportsAllMatching={false}
            />
            <div className="admin-article-list">
              {profiles.map((profile) => {
                const category = getDirectoryCategory(profile.category);
                const location = [profile.city, profile.district, profile.region].filter(Boolean).join(" · ");
                return (
                  <article className={`admin-article-row admin-directory-row ${styles.row}`} key={profile.id}>
                    <BulkSelectionCheckbox
                      checked={bulkSelection.isSelected(profile.id)}
                      disabled={!bulkSelection.ready}
                      label={`Vybrať profil ${profile.name}`}
                      onChange={() => bulkSelection.toggleRow(profile.id)}
                      className={`${adminBulkSelectionStyles.rowCheck} ${styles.rowCheck}`}
                    />
                    <div className={`admin-directory-thumb ${styles.thumb}`}>{profile.imageUrl ? <img src={profile.imageUrl} alt="" /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</div>
                    <div className={`admin-article-main ${styles.main}`}>
                      <div className="admin-article-tags">
                        <span className={`admin-status admin-status--${profile.status}`}>{profile.status === "published" ? "Publikované" : profile.status === "archived" ? "Archivované" : "Koncept"}</span>
                        <span>{category?.label ?? profile.category}</span>
                        <span>{profile.verified ? "Overené" : "Neoverené"}</span>
                        <span>{profile.imageUrl ? "Obrázok ✓" : "Bez obrázka"}</span>
                        {profile.featured && <span>Odporúčané</span>}
                      </div>
                      <h2><Link href={`/admin/adresar/${profile.id}`}>{profile.name}</Link></h2>
                      <p>{location || "Bez lokality"}</p>
                      <p className={styles.meta}>Aktualizované {formatUpdatedAt(profile.updatedAt)} · {profile.services.slice(0, 2).join(" · ") || "Bez uvedených služieb"}</p>
                    </div>
                    <div className={`admin-row-actions ${styles.actions}`}>
                      {profile.status === "published" && <Link href={directoryProfileHref(profile)} target="_blank">Pozrieť ↗</Link>}
                      <Link className="admin-row-edit" href={`/admin/adresar/${profile.id}`}>Upraviť</Link>
                      {profile.status !== "archived" && <button type="button" disabled={deletingId === profile.id} onClick={() => setDeleteTarget(profile)}>Archivovať</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : <div className="admin-empty"><span>📍</span><h2>Žiadne profily</h2><p>Zmeň filtre alebo pridaj nový profil.</p></div>}
        <AdminPagination pagination={pagination} basePath={directoryAdminHref({ ...filters, page: 1 })} />
      </section>

      <AdminDestructiveConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archivovať profil?"
        description={deleteTarget ? `Profil „${deleteTarget.name}“ prestane byť verejný a nebude sa dať upravovať, kým ho znovu neobnovíš do konceptu. Historické dáta a canonical resource zostanú zachované.` : undefined}
        affectedCount={deleteTarget ? 1 : 0}
        affectedLabel="profil"
        confirmLabel="Archivovať profil"
        pending={deletingId !== null}
        onCancel={() => { if (deletingId === null) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) void removeProfile(deleteTarget); }}
      />
    </>
  );
}
