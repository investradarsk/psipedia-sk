"use client";

import Link from "next/link";
import { AdminRecordBulkDelete } from "@/components/admin-record-bulk-delete";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminRecordTable, type AdminRecordColumn } from "@/components/admin-record-table";
import { AdminInlineRowActions, AdminInlineCellInput } from "@/components/admin-inline-edit-controls";
import {
  AdminActionButton,
  AdminBulkActionToolbar,
  AdminModalDialog,
} from "@/components/admin-interaction-system";
import { isHelpAdminCreateCategory } from "@/lib/help-admin-query";
import styles from "./admin-help-unified-table.module.css";

export type HelpDirectoryRow = {
  id: number;
  title: string;
  detail: string;
  category: string;
  status: string;
  city: string;
  updatedAt: string;
  href: string;
  inline?: {
    name: string;
    shortDescription: string;
    publicEmail: string | null;
    publicPhone: string | null;
    websiteUrl: string | null;
    editable: boolean;
  };
  inlineHelp?: { title: string; excerpt: string; editable: boolean };
  inlineDog?: { kind: "adopcia" | "stratene-a-najdene"; name: string; editable: boolean };
};
export type HelpDirectoryCategory = { slug: string; label: string; icon: string; href: string };

type BulkStatus = "draft" | "published";
type BulkPreflight = {
  selectedCount: number;
  changeCount: number;
  targetStatus: BulkStatus;
  items: { id: number; status: BulkStatus; updatedAt: string }[];
  error?: string;
};
type BulkReview = { key: string; targetStatus: BulkStatus; preview: BulkPreflight };
type ShelterDraft = {
  key: string;
  id: number;
  expectedUpdatedAt: string;
  name: string;
  shortDescription: string;
  publicEmail: string;
  publicPhone: string;
  websiteUrl: string;
};
type ShelterEditableField = "name" | "shortDescription" | "publicEmail" | "publicPhone" | "websiteUrl";
type HelpDraft = { key: string; id: number; updatedAt: string; title: string; excerpt: string };
type DogDraft = { key: string; id: number; updatedAt: string; name: string; kind: "adopcia" | "stratene-a-najdene" };

export function AdminHelpUnifiedTable({
  category, categories, rows, query, page, pages, total,
}: {
  category: string;
  categories: HelpDirectoryCategory[];
  rows: HelpDirectoryRow[];
  query: string;
  page: number;
  pages: number;
  total: number;
}) {
  const router = useRouter();
  const [selectionState, setSelectionState] = useState<{ key: string; ids: number[] }>({ key: "", ids: [] });
  const [bulkReview, setBulkReview] = useState<BulkReview | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [shelterDraft, setShelterDraft] = useState<ShelterDraft | null>(null);
  const [shelterBusy, setShelterBusy] = useState(false);
  const [helpDraft, setHelpDraft] = useState<HelpDraft | null>(null);
  const [helpBusy, setHelpBusy] = useState(false);
  const [dogDraft, setDogDraft] = useState<DogDraft | null>(null);
  const [dogBusy, setDogBusy] = useState(false);

  // A category, search, page or row change invalidates selection immediately,
  // including the preflight preview. Nothing can leak to another page/filter.
  const viewKey = JSON.stringify([category, query, page, rows.map(row => row.id)]);
  const visibleIds = new Set(rows.map(row => row.id));
  const selectedIds = selectionState.key === viewKey
    ? selectionState.ids.filter(id => visibleIds.has(id))
    : [];
  const activeReview = bulkReview?.key === viewKey ? bulkReview : null;
  const canBulkEdit = isHelpAdminCreateCategory(category);
  const canInlineEditShelters = category === "utulky";
  const canInlineEditHelp = canBulkEdit;
  const canInlineEditDogs = category === "adopcia" || category === "stratene-a-najdene";
  const activeShelterDraft = canInlineEditShelters && shelterDraft?.key === viewKey &&
    visibleIds.has(shelterDraft.id) ? shelterDraft : null;
  const activeHelpDraft = canInlineEditHelp && helpDraft?.key === viewKey &&
    rows.some(row => row.id === helpDraft.id && row.updatedAt === helpDraft.updatedAt) ? helpDraft : null;
  const activeDogDraft = canInlineEditDogs && dogDraft?.key === viewKey &&
    rows.some(row => row.id === dogDraft.id && row.updatedAt === dogDraft.updatedAt) ? dogDraft : null;

  const categoryHref = (slug: string, nextPage = 1) => {
    const params = new URLSearchParams();
    params.set("category", slug);
    if (query) params.set("q", query);
    if (nextPage > 1) params.set("page", String(nextPage));
    return "/admin/pomoc-psom?" + params;
  };
  const active = categories.find(item => item.slug === category) ?? categories[0];

  function changeSelection(ids: number[]) {
    if (bulkBusy || !canBulkEdit) return;
    setSelectionState({ key: viewKey, ids: ids.filter(id => visibleIds.has(id)) });
    setBulkReview(null);
    setMessage("");
  }

  function beginShelterEdit(item: HelpDirectoryRow) {
    if (shelterBusy || !canInlineEditShelters || !item.inline?.editable) return;
    setBulkReview(null);
    setMessage("");
    setShelterDraft({
      key: viewKey,
      id: item.id,
      expectedUpdatedAt: item.updatedAt,
      name: item.inline.name,
      shortDescription: item.inline.shortDescription,
      publicEmail: item.inline.publicEmail || "",
      publicPhone: item.inline.publicPhone || "",
      websiteUrl: item.inline.websiteUrl || "",
    });
  }

  function changeShelterField(field: ShelterEditableField, value: string) {
    setShelterDraft(previous => previous && previous.key === viewKey
      ? { ...previous, [field]: value } : previous);
  }

  async function saveShelterEdit() {
    const draft = activeShelterDraft;
    if (!draft || shelterBusy) return;
    setShelterBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/organizations/" + draft.id, {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: draft.expectedUpdatedAt,
          changes: {
            name: draft.name,
            shortDescription: draft.shortDescription,
            publicEmail: draft.publicEmail,
            publicPhone: draft.publicPhone,
            websiteUrl: draft.websiteUrl,
          },
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Rýchlu úpravu sa nepodarilo uložiť.");
      setShelterDraft(null);
      setMessage("Zmeny útulku boli uložené. Aktualizujem tabuľku.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Úprava zlyhala. Obnov tabuľku a skús znova.");
    } finally {
      setShelterBusy(false);
    }
  }

  function beginHelpEdit(item: HelpDirectoryRow) {
    if (!canInlineEditHelp || !item.inlineHelp?.editable || helpBusy) return;
    setMessage("");
    setBulkReview(null);
    setHelpDraft({
      key: viewKey, id: item.id, updatedAt: item.updatedAt,
      title: item.inlineHelp.title, excerpt: item.inlineHelp.excerpt,
    });
  }

  async function saveHelpEdit() {
    const draft = activeHelpDraft;
    if (!draft || helpBusy || !draft.title.trim()) return;
    setHelpBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/help/" + draft.id, {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set-inline-editorial",
          expectedCategory: category,
          expectedUpdatedAt: draft.updatedAt,
          changes: { title: draft.title, excerpt: draft.excerpt },
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Rýchlu úpravu sa nepodarilo uložiť.");
      setHelpDraft(null);
      setMessage("Názov a krátky popis boli uložené.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Úpravu sa nepodarilo uložiť.");
    } finally {
      setHelpBusy(false);
    }
  }

  function beginDogEdit(item: HelpDirectoryRow) {
    if (!canInlineEditDogs || !item.inlineDog?.editable || dogBusy) return;
    setMessage("");
    setDogDraft({
      key: viewKey, id: item.id, updatedAt: item.updatedAt,
      kind: item.inlineDog.kind, name: item.inlineDog.name,
    });
  }
  async function saveDogEdit() {
    const draft = activeDogDraft;
    if (!draft || dogBusy || (draft.kind === "adopcia" && !draft.name.trim())) return;
    setDogBusy(true); setMessage("");
    try {
      const isAdoption = draft.kind === "adopcia";
      const response = await fetch(isAdoption
        ? "/api/admin/adoptions/" + draft.id
        : "/api/admin/lost-found/" + draft.id, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isAdoption
          ? { action: "set-inline-name", name: draft.name, expectedUpdatedAt: draft.updatedAt }
          : { action: "set-inline-dog-name", dogName: draft.name || null, expectedUpdatedAt: draft.updatedAt }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Meno psa sa nepodarilo uložiť.");
      setDogDraft(null);
      setMessage("Meno psa bolo uložené v kanonickom profile.");
      router.refresh();
    } catch(error) {
      setMessage(error instanceof Error ? error.message : "Rýchlu úpravu sa nepodarilo uložiť.");
    } finally { setDogBusy(false); }
  }

  const tableColumns: AdminRecordColumn<HelpDirectoryRow>[] = [
    {
      id: "title", label: "Názov / pes", width: canInlineEditShelters ? 240 : 265,
      sortValue: item => item.title,
      cell: item => activeShelterDraft?.id === item.id
        ? <input
          className={styles.inlineInput} aria-label={"Názov útulku " + item.title}
          value={activeShelterDraft.name} maxLength={180} required disabled={shelterBusy}
          onChange={event => changeShelterField("name", event.target.value)}
        />
        : activeDogDraft?.id === item.id
          ? <AdminInlineCellInput label={"Meno psa " + item.title}
              value={activeDogDraft.name} maxLength={activeDogDraft.kind === "adopcia" ? 180 : 120}
              required={activeDogDraft.kind === "adopcia"} disabled={dogBusy}
              onChange={name => setDogDraft(current => current ? { ...current, name } : null)} />
        : activeHelpDraft?.id === item.id
          ? <AdminInlineCellInput label={"Názov záznamu " + item.title}
              value={activeHelpDraft.title} maxLength={180} required disabled={helpBusy}
              onChange={title => setHelpDraft(current => current ? { ...current, title } : null)} />
          : <Link className={styles.primary} href={item.href}>{item.title}</Link>,
    },
    { id: "detail", label: "Typ / doplnenie", width: canInlineEditShelters ? 140 : 205, sortValue: item => item.detail, cell: item => item.detail || "—" },
    { id: "city", label: "Lokalita", width: canInlineEditShelters ? 130 : 160, sortValue: item => item.city, cell: item => item.city || "—" },
    { id: "status", label: "Stav", width: canInlineEditShelters ? 115 : 150, sortValue: item => item.status, cell: item => item.status },
    ...(canInlineEditShelters ? [
      {
        id: "description", label: "Krátky popis", width: 220,
        sortValue: (item: HelpDirectoryRow) => item.inline?.shortDescription || "",
        cell: (item: HelpDirectoryRow) => activeShelterDraft?.id === item.id
          ? <textarea
            className={styles.inlineTextarea} aria-label={"Krátky popis útulku " + item.title}
            value={activeShelterDraft.shortDescription} maxLength={700} rows={3} disabled={shelterBusy}
            onChange={event => changeShelterField("shortDescription", event.target.value)}
          />
          : <span title={item.inline?.shortDescription}>{item.inline?.shortDescription || "—"}</span>,
      },
      {
        id: "contact", label: "Verejný kontakt", width: 245,
        cell: (item: HelpDirectoryRow) => activeShelterDraft?.id === item.id
          ? <div className={styles.inlineContacts}>
            <input className={styles.inlineInput} type="email" aria-label={"Verejný e-mail " + item.title}
              placeholder="E-mail" value={activeShelterDraft.publicEmail} maxLength={320} disabled={shelterBusy}
              onChange={event => changeShelterField("publicEmail", event.target.value)} />
            <input className={styles.inlineInput} type="tel" aria-label={"Verejný telefón " + item.title}
              placeholder="Telefón" value={activeShelterDraft.publicPhone} maxLength={100} disabled={shelterBusy}
              onChange={event => changeShelterField("publicPhone", event.target.value)} />
            <input className={styles.inlineInput} type="url" aria-label={"Webstránka " + item.title}
              placeholder="https://…" value={activeShelterDraft.websiteUrl} maxLength={1200} disabled={shelterBusy}
              onChange={event => changeShelterField("websiteUrl", event.target.value)} />
          </div>
          : <span className={styles.inlineContactPreview}>
            {item.inline?.publicEmail || item.inline?.publicPhone || item.inline?.websiteUrl || "—"}
          </span>,
      },
    ] : []),
    ...(canInlineEditHelp ? [{
      id: "helpExcerpt", label: "Krátky popis", width: 255,
      sortValue: (item: HelpDirectoryRow) => item.inlineHelp?.excerpt || "",
      cell: (item: HelpDirectoryRow) => activeHelpDraft?.id === item.id
        ? <AdminInlineCellInput label={"Krátky popis " + item.title}
            value={activeHelpDraft.excerpt} maxLength={700} disabled={helpBusy}
            onChange={excerpt => setHelpDraft(current => current ? { ...current, excerpt } : null)} />
        : <span title={item.inlineHelp?.excerpt || ""}>{item.inlineHelp?.excerpt || "—"}</span>,
    }] : []),
    {
      id: "updated", label: "Aktualizované", width: canInlineEditShelters ? 123 : 145,
      sortValue: item => item.updatedAt,
      cell: item => item.updatedAt ? new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.updatedAt)) : "—",
    },
    {
      id: "actions", label: "Akcia", width: canInlineEditShelters || canInlineEditHelp || canInlineEditDogs ? 180 : 125,
      cell: item => canInlineEditShelters
        ? activeShelterDraft?.id === item.id
          ? <span className={styles.inlineActions}>
            <button type="button" className={styles.inlineSave} disabled={shelterBusy || !activeShelterDraft.name.trim()}
              onClick={() => void saveShelterEdit()}>{shelterBusy ? "Ukladám…" : "Uložiť"}</button>
            <button type="button" className={styles.inlineCancel} disabled={shelterBusy}
              onClick={() => { setShelterDraft(null); setMessage(""); }}>Zrušiť</button>
          </span>
          : <span className={styles.inlineActions}>
            {item.inline?.editable && <button type="button" className={styles.inlineTrigger} disabled={shelterBusy}
              onClick={() => beginShelterEdit(item)}>Upraviť v tabuľke</button>}
            <Link className={styles.action} href={item.href}>Detail →</Link>
          </span>
        : canInlineEditDogs && item.inlineDog?.editable
          ? <span className={styles.inlineActions}>
            <AdminInlineRowActions
              editing={activeDogDraft?.id === item.id} busy={dogBusy}
              disabled={Boolean(activeDogDraft && activeDogDraft.id !== item.id) ||
                (activeDogDraft?.id === item.id && activeDogDraft.kind === "adopcia" && !activeDogDraft.name.trim())}
              onEdit={() => beginDogEdit(item)}
              onSave={() => void saveDogEdit()}
              onCancel={() => { if (!dogBusy) setDogDraft(null); }}
            />
            <Link className={styles.action} href={item.href}>Detail →</Link>
          </span>
        : canInlineEditHelp && item.inlineHelp?.editable
          ? <span className={styles.inlineActions}>
              <AdminInlineRowActions
                editing={activeHelpDraft?.id === item.id} busy={helpBusy}
                disabled={Boolean(activeHelpDraft && activeHelpDraft.id !== item.id) ||
                  (activeHelpDraft?.id === item.id && !activeHelpDraft.title.trim())}
                onEdit={() => beginHelpEdit(item)}
                onSave={() => void saveHelpEdit()}
                onCancel={() => { if (!helpBusy) setHelpDraft(null); }}
              />
              <Link className={styles.action} href={item.href}>Detail →</Link>
            </span>
          : <Link className={styles.action} href={item.href}>Upraviť →</Link>,
    },
  ];

  async function prepareBulk(targetStatus: BulkStatus) {
    if (!canBulkEdit || bulkBusy || !selectedIds.length) return;
    setBulkBusy(true);
    setBulkReview(null);
    setMessage("");
    const selectionIds = [...selectedIds];
    try {
      const response = await fetch("/api/admin/help/bulk", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "preflight",
          expectedCategory: category,
          targetStatus,
          selection: { mode: "ids", ids: selectionIds },
        }),
      });
      const preview = await response.json() as BulkPreflight;
      if (!response.ok) throw new Error(preview.error || "Kontrola hromadnej úpravy zlyhala.");
      if (!preview.changeCount) {
        setMessage("Vybrané záznamy už majú požadovaný publikačný stav.");
        return;
      }
      setBulkReview({ key: viewKey, targetStatus, preview });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kontrola hromadnej úpravy zlyhala.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulk() {
    if (!activeReview || bulkBusy || !canBulkEdit) return;
    setBulkBusy(true);
    setMessage("");
    try {
      const { targetStatus, preview } = activeReview;
      const response = await fetch("/api/admin/help/bulk", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          targetStatus,
          confirmedCount: preview.items.length,
          items: preview.items,
        }),
      });
      const result = await response.json() as { requested?: number; changed?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Hromadnú zmenu sa nepodarilo uložiť.");
      setBulkReview(null);
      setSelectionState({ key: viewKey, ids: [] });
      setMessage("Uložené: " + (result.changed ?? 0) + " z " + (result.requested ?? preview.items.length) + " potvrdených zmien.");
      router.refresh();
    } catch (error) {
      // Keep the selection and allow re-checking rather than silently retrying.
      setBulkReview(null);
      setMessage(error instanceof Error ? error.message : "Hromadná zmena zlyhala. Obnov výber a skontroluj ho znova.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className={styles.workspace} aria-label="Pomoc psom – spoločná tabuľka" data-admin-help-unified-grid>
      <div className={styles.intro}>
        <div>
          <strong>Profily a prípady</strong>
          <p>Vyber kategóriu, uprav povolené údaje priamo v tabuľke alebo otvor kompletný editor.</p>
        </div>
        <Link className={styles.categoryAction} href={active.href}>Pokročilá správa kategórie</Link>
      </div>
      <nav className={styles.categories} aria-label="Kategórie Pomoci psom">
        {categories.map(item => (
          <Link key={item.slug} href={categoryHref(item.slug)} aria-current={item.slug === category ? "page" : undefined}>
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </Link>
        ))}
      </nav>
      <form className={styles.search} method="get">
        <input type="hidden" name="category" value={category} />
        <label htmlFor="help-unified-query">Hľadať v kategórii</label>
        <input id="help-unified-query" name="q" defaultValue={query} placeholder="Admin ID, meno psa, názov alebo mesto…" maxLength={80} />
        <button type="submit">Hľadať</button>
        {query && <Link href={categoryHref(category).split("&q=")[0]}>Vyčistiť</Link>}
      </form>
      <p className={styles.count}>Nájdených záznamov: <strong>{total}</strong> · Strana {page} z {pages}</p>

      {canBulkEdit && rows.length > 0 && (
        <div className={styles.bulkPanel} aria-busy={bulkBusy}>
          <p>Označ záznamy zaškrtávacími políčkami. Výber platí iba pre túto kategóriu a zobrazenú stranu ({rows.length} záznamov).</p>
          {selectedIds.length > 0 && (
            <AdminBulkActionToolbar
              selectedCount={selectedIds.length}
              selectionDescription="Iba aktuálna strana a kategória. Pred zmenou server overí aktuálny stav."
              onClear={() => changeSelection([])}
              primaryAction={
                <AdminActionButton variant="primary" disabled={bulkBusy} onClick={() => void prepareBulk("published")}>
                  Skontrolovať publikovanie
                </AdminActionButton>
              }
              destructiveAction={
                <AdminActionButton variant="destructive" disabled={bulkBusy} onClick={() => void prepareBulk("draft")}>
                  Skontrolovať presun do konceptov
                </AdminActionButton>
              }
            />
          )}
        </div>
      )}
      {canBulkEdit && selectedIds.length > 0 && <AdminRecordBulkDelete
        kind="help" selectedIds={selectedIds}
        disabled={bulkBusy || helpBusy || shelterBusy || dogBusy}
        onFinished={ids => {
          changeSelection(selectedIds.filter(id => !ids.includes(id)));
          router.refresh();
        }}
      />}
      {canInlineEditShelters && rows.length > 0 && (
        <p className={styles.bulkHint}>
          Klikni na <strong>Upraviť v tabuľke</strong> a ulož názov, krátky popis či verejný kontakt priamo v riadku.
          Stav publikovania, typ organizácie a adresy zostávajú v editore Detail.
        </p>
      )}
      {canInlineEditHelp && rows.length > 0 && (
        <p className={styles.bulkHint}>Rýchlo uprav názov a krátky popis prípadu priamo v tabuľke. Publikovanie a ostatné polia spravuj existujúcimi akciami.</p>
      )}
      {canInlineEditDogs && rows.length > 0 && <p className={styles.bulkHint}>
        Priamo uprav meno psa. Stavy adopcií, moderovanie hlásení a kontakty ostávajú v plných editoroch.
      </p>}
      {message && <p className={styles.bulkMessage} role="status">{message}</p>}

      {rows.length ? <AdminRecordTable
        rows={rows}
        label={active.label}
        busy={bulkBusy || shelterBusy || helpBusy || dogBusy}
        serverSorted
        stretch={canInlineEditShelters || canInlineEditHelp || canInlineEditDogs}
        selection={canBulkEdit ? {
          selectedIds,
          disabled: bulkBusy,
          labelForRow: item => "Označiť " + item.title,
          onChange: changeSelection,
        } : undefined}
        columns={tableColumns}
      /> : <p className={styles.empty}>Pre tento výber nie sú záznamy. Skús vyhľadávať iné slovo alebo zmeniť kategóriu.</p>}
      {!canBulkEdit && rows.length > 0 && !canInlineEditShelters && !canInlineEditDogs && (
        <p className={styles.bulkHint}>Táto kategória má vlastné pravidlá zmien. Hromadné úpravy sa vykonávajú iba v príslušnom module, nie cez spoločnú tabuľku.</p>
      )}
      {pages > 1 && <nav className={styles.pagination} aria-label="Stránkovanie Pomoci psom">
        {page > 1 ? <Link href={categoryHref(category, page - 1)}>← Predchádzajúca</Link> : <span>← Predchádzajúca</span>}
        <span>{page} / {pages}</span>
        {page < pages ? <Link href={categoryHref(category, page + 1)}>Ďalšia →</Link> : <span>Ďalšia →</span>}
      </nav>}

      <AdminModalDialog
        open={activeReview !== null}
        title={activeReview?.targetStatus === "published" ? "Publikovať vybrané záznamy?" : "Presunúť vybrané záznamy do konceptov?"}
        description="Po potvrdení server znova overí stav a verziu všetkých záznamov. Nie je to hromadné odstránenie."
        onClose={() => { if (!bulkBusy) setBulkReview(null); }}
        footer={<>
          <AdminActionButton variant="neutral" disabled={bulkBusy} onClick={() => setBulkReview(null)}>Zrušiť</AdminActionButton>
          <AdminActionButton
            variant={activeReview?.targetStatus === "draft" ? "destructive" : "primary"}
            disabled={bulkBusy || !activeReview}
            onClick={() => void applyBulk()}
          >
            {bulkBusy ? "Ukladám…" : "Potvrdiť hromadnú zmenu"}
          </AdminActionButton>
        </>}
      >
        {activeReview && <p>Označených: <strong>{activeReview.preview.selectedCount}</strong>.
          Zmení sa <strong>{activeReview.preview.changeCount}</strong>.
          Bez zmeny zostane <strong>{activeReview.preview.selectedCount - activeReview.preview.changeCount}</strong>.
        </p>}
      </AdminModalDialog>
    </section>
  );
}
