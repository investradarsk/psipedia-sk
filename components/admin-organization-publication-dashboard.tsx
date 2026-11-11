"use client";

import Link from "next/link";
import { AdminRecordTable } from "./admin-record-table";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

const subscribeToHydration = () => () => {};
import {
  useAdminBulkSelection,
} from "@/components/admin-bulk-selection";
import {
  AdminActionButton,
  AdminBulkActionToolbar,
  AdminModalDialog,
  AdminDestructiveConfirmDialog,
} from "@/components/admin-interaction-system";
import { AdminPagination } from "@/components/admin-pagination";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminInlineRowActions, AdminInlineCellInput } from "@/components/admin-inline-edit-controls";
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

export function AdminOrganizationPublicationDashboard({ data, filters, reviewedIds = [] }: {
  data: OrganizationAdminPage;
  filters: OrganizationAdminFilters;
  reviewedIds?: number[];
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const reviewed = new Set(reviewedIds);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState<OrganizationPublicationAction | null>(null);
  const [pendingPublication, setPendingPublication] = useState<{ item: OrganizationPublicationAdminItem; action: OrganizationPublicationAction } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [inlineDraft, setInlineDraft] = useState<{ key: string; id: number; updatedAt: string; name: string; shortDescription: string } | null>(null);
  const [inlineBusy, setInlineBusy] = useState(false);

  const pageIds = data.items.map((item) => item.id);
  const viewFingerprint = JSON.stringify({
    q: filters.q,
    type: filters.type,
    status: filters.status,
    region: filters.region,
    district: filters.district,
    city: filters.city,
    missingLocation: filters.missingLocation,
    incomplete: filters.incomplete,
    page: data.pagination.page,
  });
  const activeInline = inlineDraft?.key === viewFingerprint &&
    data.items.some(item => item.id === inlineDraft.id && item.updatedAt === inlineDraft.updatedAt)
      ? inlineDraft : null;

  function editInline(item: OrganizationPublicationAdminItem) {
    if (inlineBusy || busyId !== null || bulkBusy || item.status === "ARCHIVED") return;
    setError("");
    setMessage("");
    setInlineDraft({
      key: viewFingerprint, id: item.id, updatedAt: item.updatedAt,
      name: item.name, shortDescription: item.shortDescription,
    });
  }

  async function saveInline() {
    const draft = activeInline;
    if (!draft || inlineBusy || !draft.name.trim()) return;
    setInlineBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/organizations/" + draft.id, {
        method: "PATCH",
        credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set-inline-summary",
          expectedUpdatedAt: draft.updatedAt,
          changes: { name: draft.name, shortDescription: draft.shortDescription },
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Organizáciu sa nepodarilo upraviť.");
      setInlineDraft(null);
      setMessage("Názov a krátky popis organizácie boli uložené.");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Rýchla úprava zlyhala.");
    } finally {
      setInlineBusy(false);
    }
  }

  const bulkSelection = useAdminBulkSelection({
    module: "organizations",
    membershipFingerprint: viewFingerprint,
    pageIds,
    resultCount: data.items.length,
    supportsAllMatching: false,
  });
  const selectedItems = data.items.filter((item) => bulkSelection.isSelected(item.id));

  function isBulkEligible(item: OrganizationPublicationAdminItem, action: OrganizationPublicationAction) {
    if (action === "publish") return item.status === "DRAFT" && item.preflight.ready;
    if (action === "unpublish") return item.status === "PUBLISHED";
    if (action === "archive") return item.status !== "ARCHIVED";
    return item.status === "ARCHIVED";
  }

  const bulkTargets = bulkAction ? selectedItems.filter((item) => isBulkEligible(item, bulkAction)) : [];

  async function applyBulkPublication() {
    if (!hydrated || !bulkAction || !bulkTargets.length || bulkBusy) return;
    setBulkBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/organizations/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: bulkAction,
          items: bulkTargets.map((item) => ({ id: item.id, updatedAt: item.updatedAt })),
        }),
      });
      const payload = await response.json() as {
        error?: string;
        counts?: { requested: number; updated: number; failed: number };
        failed?: Array<{ id: number; reason: string }>;
      };
      if (!response.ok || !payload.counts) throw new Error(payload.error || "Hromadnú lifecycle zmenu sa nepodarilo vykonať.");

      const summary = `Zmenených organizácií: ${payload.counts.updated} z ${payload.counts.requested}.`;
      if (payload.counts.failed > 0) {
        setError(`${summary} Zlyhalo: ${payload.counts.failed}. Výber zostal zachovaný na kontrolu.`);
      } else {
        setMessage(summary);
        bulkSelection.clear();
      }
      setBulkAction(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Hromadnú lifecycle zmenu sa nepodarilo vykonať.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function changePublication() {
    const pending = pendingPublication;
    if (!hydrated || !pending || busyId !== null || bulkBusy) return;
    const { item, action } = pending;
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
    } finally { setBusyId(null); setPendingPublication(null); }
  }

  function requestPublication(item: OrganizationPublicationAdminItem, action: OrganizationPublicationAction) {
    if (!hydrated || busyId !== null || bulkBusy || bulkAction !== null) return;
    setPendingPublication({ item, action });
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

      {!!data.items.length && <p className={styles.bulkSelect}>
        {bulkSelection.currentPageSelected} z {data.items.length} označených na tejto strane
      </p>}

      {bulkSelection.selectedCount > 0 && (
        <AdminBulkActionToolbar
          selectedCount={bulkSelection.selectedCount}
          selectionDescription="Výber patrí iba aktuálnej filtrovanej strane."
          primaryAction={<AdminActionButton variant="primary" disabled={!hydrated || bulkBusy} onClick={() => setBulkAction("publish")}>Publikovať</AdminActionButton>}
          secondaryActions={<>
            <AdminActionButton variant="secondary" disabled={!hydrated || bulkBusy} onClick={() => setBulkAction("unpublish")}>Do konceptu</AdminActionButton>
            <AdminActionButton variant="secondary" disabled={!hydrated || bulkBusy} onClick={() => setBulkAction("restore")}>Obnoviť</AdminActionButton>
          </>}
          destructiveAction={<AdminActionButton variant="destructive" disabled={!hydrated || bulkBusy} onClick={() => setBulkAction("archive")}>Archivovať</AdminActionButton>}
          onClear={bulkSelection.clear}
        />
      )}

      {data.items.length ? <AdminRecordTable
        rows={data.items}
        label="Organizácie"
        rowDataAttribute="data-admin-organization-row"
        serverSorted
        stretch
        busy={!hydrated || inlineBusy || bulkBusy || busyId !== null}
        serverSorting={{
          id: filters.sort ?? "updated",
          desc: (filters.direction ?? "desc") === "desc",
          allowedIds: ["name", "city", "status", "updated"],
          onChange: next => {
            const sort = ["name", "city", "status"].includes(next.id)
              ? next.id as "name" | "city" | "status" : "updated";
            router.push(organizationAdminHref({ ...filters, sort, direction: next.desc ? "desc" : "asc", page: 1 }));
          },
        }}
        selection={{
          selectedIds: bulkSelection.selection.mode === "explicit" ? bulkSelection.selection.ids : [],
          disabled: !hydrated || !bulkSelection.ready || bulkBusy,
          selectAllLabel: "Označiť všetky zobrazené organizácie",
          labelForRow: item => `Označiť organizáciu ${item.name}`,
          onChange: ids => {
            for (const id of pageIds) {
              if (bulkSelection.isSelected(id) !== ids.includes(id)) bulkSelection.toggleRow(id);
            }
          },
        }}
        columns={[
          { id: "image", label: "Foto", width: 73, cell: item =>
            <span className={styles.gridThumb}>{item.imageUrl
              ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
              : <span aria-hidden="true">🐾</span>}</span> },
          { id: "name", label: "Organizácia", width: 260, sortValue: item => item.name,
            cell: item => <div className={styles.gridIdentity}>
              {activeInline?.id === item.id
                ? <AdminInlineCellInput label={"Názov organizácie " + item.name} value={activeInline.name}
                    maxLength={180} required disabled={inlineBusy}
                    onChange={name => setInlineDraft(current => current ? { ...current, name } : null)} />
                : <strong><Link href={`/admin/organizacie/${item.id}`}>{item.name || "Bez názvu"}</Link></strong>}
              <small>/{item.slug || "—"}</small>
            </div> },
          { id: "status", label: "Publikovanie", width: 130, sortValue: item => item.status,
            cell: item => <span className={"admin-status admin-status--" + (item.status === "PUBLISHED" ? "published" : "draft")}>{statusLabels[item.status]}</span> },
          { id: "type", label: "Typ", width: 140, cell: item => typeLabels[item.type] ?? item.type },
          { id: "city", label: "Mesto", width: 145, sortValue: item => item.primaryCity,
            cell: item => item.primaryCity || "Bez lokality" },
          { id: "description", label: "Krátky popis", width: 245,
            cell: item => activeInline?.id === item.id
              ? <AdminInlineCellInput label={"Krátky popis organizácie " + item.name}
                  value={activeInline.shortDescription} maxLength={700} disabled={inlineBusy}
                  onChange={shortDescription => setInlineDraft(current => current ? { ...current, shortDescription } : null)} />
              : <span title={item.shortDescription || item.description || ""}>{item.shortDescription || item.description || "Bez verejného popisu"}</span> },
          { id: "completeness", label: "Úplnosť", width: 173, cell: item =>
            <span title={item.completenessHints.join(" · ") + (item.preflight.ready ? "" : " · " + item.preflight.blockers.map(b => b.message).join(" "))}>
              {item.preflight.ready ? "Pripravené" : "Potrebná kontrola"} · {item.completenessHints.length} medzier
            </span> },
          { id: "updated", label: "Upravené", width: 160, sortValue: item => item.updatedAt,
            cell: item => formatDate(item.updatedAt) },
          { id: "actions", label: "Akcie", width: 360, cell: item => {
            const isPublic = item.status === "PUBLISHED" && Boolean(item.publishedAt) && !item.archivedAt;
            return <div className={styles.gridActions}>
              <AdminReviewCheckbox entityType="ORGANIZATION" entityId={item.id} initialReviewed={reviewed.has(item.id)} compact />
              {isPublic && <Link href={"/organizacie/" + item.slug} target="_blank" rel="noreferrer">Web ↗</Link>}
              {item.status !== "ARCHIVED" && <span className={styles.inlineDesktop}><AdminInlineRowActions
                editing={activeInline?.id === item.id} busy={inlineBusy}
                disabled={busyId !== null || bulkBusy || (activeInline !== null && activeInline.id !== item.id)
                  || (activeInline?.id === item.id && !activeInline.name.trim())}
                onEdit={() => editInline(item)} onSave={() => void saveInline()}
                onCancel={() => { if (!inlineBusy) setInlineDraft(null); }}
              /></span>}
              <Link href={"/admin/organizacie/" + item.id}>Spravovať</Link>
              <Link href={`/admin/organizacie/${item.id}#fundraising`}>Fundraising</Link>
              {item.status === "DRAFT" && <AdminActionButton variant="primary"
                disabled={!hydrated || !item.preflight.ready || busyId !== null || bulkBusy}
                onClick={() => requestPublication(item, "publish")}>Publikovať</AdminActionButton>}
              {item.status === "PUBLISHED" && <AdminActionButton variant="secondary"
                disabled={!hydrated || busyId !== null || bulkBusy}
                onClick={() => requestPublication(item, "unpublish")}>Do konceptu</AdminActionButton>}
              {item.status !== "ARCHIVED" && <AdminActionButton variant="destructive"
                disabled={!hydrated || busyId !== null || bulkBusy}
                onClick={() => requestPublication(item, "archive")}>Archivovať</AdminActionButton>}
              {item.status === "ARCHIVED" && <AdminActionButton variant="secondary"
                disabled={!hydrated || busyId !== null || bulkBusy}
                onClick={() => requestPublication(item, "restore")}>Obnoviť</AdminActionButton>}
            </div>;
          } },
        ]}
      /> : <div className="admin-empty"><span>🐾</span><h2>Žiadne organizácie</h2><p>Zmeň filtre alebo vytvor nový canonical záznam.</p></div>}
      <AdminPagination pagination={data.pagination} basePath={organizationAdminHref({ ...filters, page: 1 })} />
    </section>

    <AdminDestructiveConfirmDialog
      open={pendingPublication !== null}
      title={pendingPublication?.action === "publish" ? "Publikovať organizáciu?"
        : pendingPublication?.action === "unpublish" ? "Presunúť organizáciu do konceptu?"
        : pendingPublication?.action === "archive" ? "Archivovať organizáciu?"
        : "Obnoviť organizáciu?"}
      description={pendingPublication ? actionQuestion(pendingPublication.item, pendingPublication.action) : undefined}
      affectedCount={1}
      affectedLabel="organizáciu"
      confirmLabel={pendingPublication?.action === "publish" ? "Publikovať"
        : pendingPublication?.action === "unpublish" ? "Presunúť do konceptu"
        : pendingPublication?.action === "archive" ? "Archivovať" : "Obnoviť"}
      confirmVariant={pendingPublication?.action === "archive" || pendingPublication?.action === "unpublish" ? "destructive" : "primary"}
      pending={busyId !== null}
      onCancel={() => { if (busyId === null) setPendingPublication(null); }}
      onConfirm={() => void changePublication()}
    />

    <AdminModalDialog
      open={bulkAction !== null}
      title={bulkAction === "publish" ? "Publikovať vybrané organizácie"
        : bulkAction === "unpublish" ? "Presunúť vybrané organizácie do konceptu"
        : bulkAction === "archive" ? "Archivovať vybrané organizácie"
        : "Obnoviť vybrané organizácie"}
      description={bulkAction === "archive"
        ? "Archivovanie zneprístupní verejné profily. Akcia sa vykoná iba pre záznamy, ktoré stále spĺňajú canonical lifecycle."
        : "Server pred zmenou znovu overí aktuálny lifecycle a verziu každého záznamu."}
      onClose={() => { if (!bulkBusy) setBulkAction(null); }}
      preferExplicitAutofocus
      footer={<>
        <AdminActionButton variant="neutral" data-admin-autofocus="true" disabled={!hydrated || bulkBusy} onClick={() => setBulkAction(null)}>Zrušiť</AdminActionButton>
        <AdminActionButton
          variant={bulkAction === "archive" ? "destructive" : "primary"}
          disabled={!hydrated || bulkBusy || bulkTargets.length === 0}
          onClick={() => void applyBulkPublication()}
        >
          {bulkBusy ? "Spracúvam…" : bulkAction === "archive" ? "Archivovať" : "Potvrdiť zmenu"}
        </AdminActionButton>
      </>}
    >
      <p>
        Zmení sa <strong>{bulkTargets.length}</strong> z {selectedItems.length} vybraných organizácií.
        {selectedItems.length - bulkTargets.length > 0 && <> {selectedItems.length - bulkTargets.length} záznamov už nemá pre túto akciu platný lifecycle alebo publication preflight.</>}
      </p>
    </AdminModalDialog>
  </>;
}
