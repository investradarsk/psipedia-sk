"use client";

import { useMemo, useState } from "react";
import {
  AdminActionButton,
  AdminDestructiveConfirmDialog,
  AdminModalDialog,
} from "@/components/admin-interaction-system";
import { normalizeDogNameDayName, type DogNameDayRecord, type DogNameDayStatus } from "@/lib/dog-name-days";
import styles from "./admin-dog-name-day-dashboard.module.css";

const MONTHS = [
  "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
  "Júl", "August", "September", "Október", "November", "December",
];

type FormState = {
  id: number | null;
  month: number;
  day: number;
  name: string;
  status: DogNameDayStatus;
  source: string;
  note: string;
};

type ImportPlan = {
  summary: { INSERT: number; UPDATE: number; SKIP: number; ERROR: number };
  actions: Array<{ index: number; action: "INSERT" | "UPDATE" | "SKIP" | "ERROR"; message?: string }>;
};

const EMPTY_FORM: FormState = { id: null, month: 1, day: 1, name: "", status: "draft", source: "", note: "" };

function recordToForm(record: DogNameDayRecord): FormState {
  return {
    id: record.id,
    month: record.month,
    day: record.day,
    name: record.name,
    status: record.status,
    source: record.source,
    note: record.note ?? "",
  };
}

function statusLabel(status: DogNameDayStatus) {
  return status === "published" ? "Publikované" : status === "archived" ? "Archivované" : "Koncept";
}

export function AdminDogNameDayDashboard({ initialRecords }: { initialRecords: DogNameDayRecord[] }) {
  const [records, setRecords] = useState(initialRecords);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState<DogNameDayStatus | "all">("all");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<DogNameDayRecord | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importText, setImportText] = useState("[]");
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [importPending, setImportPending] = useState(false);

  const filtered = useMemo(() => {
    const needle = normalizeDogNameDayName(query);
    return records.filter((record) => {
      const matchesQuery = !needle || record.normalizedName.includes(needle) || normalizeDogNameDayName(record.source).includes(needle);
      return matchesQuery && (!month || record.month === Number(month)) && (status === "all" || record.status === status);
    });
  }, [records, query, month, status]);

  const counts = useMemo(() => records.reduce((result, record) => {
    result[record.status] += 1;
    return result;
  }, { draft: 0, published: 0, archived: 0 }), [records]);

  async function reload() {
    const response = await fetch("/api/admin/name-days", { cache: "no-store" });
    const result = await response.json() as { records?: DogNameDayRecord[]; error?: string };
    if (!response.ok || !result.records) throw new Error(result.error || "Kalendár sa nepodarilo obnoviť.");
    setRecords(result.records);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setError("");
    setMessage("");
    setEditorOpen(true);
  }

  function openEdit(record: DogNameDayRecord) {
    setForm(recordToForm(record));
    setError("");
    setMessage("");
    setEditorOpen(true);
  }

  async function saveRecord() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(form.id ? `/api/admin/name-days/${form.id}` : "/api/admin/name-days", {
        method: form.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, note: form.note.trim() || null }),
      });
      const result = await response.json() as { record?: DogNameDayRecord; error?: string };
      if (!response.ok || !result.record) throw new Error(result.error || "Záznam sa nepodarilo uložiť.");
      await reload();
      setEditorOpen(false);
      setMessage(form.id ? "Záznam bol upravený." : "Záznam bol vytvorený.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Záznam sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveRecord() {
    if (!archiveTarget) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/name-days/${archiveTarget.id}`, { method: "DELETE" });
      const result = await response.json() as { record?: DogNameDayRecord; error?: string };
      if (!response.ok || !result.record) throw new Error(result.error || "Záznam sa nepodarilo archivovať.");
      await reload();
      setArchiveTarget(null);
      setMessage("Záznam bol archivovaný a nie je verejne eligible.");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Záznam sa nepodarilo archivovať.");
    } finally {
      setSaving(false);
    }
  }

  function parsedImport() {
    try { return JSON.parse(importText) as unknown; }
    catch { throw new Error("Import nie je platný JSON."); }
  }

  async function runImport(apply: boolean) {
    setImportPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/name-days/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records: parsedImport(), apply }),
      });
      const result = await response.json() as { plan?: ImportPlan; applied?: boolean; error?: string };
      if (result.plan) setImportPlan(result.plan);
      if (!response.ok) throw new Error(result.error || "Import sa nepodaril.");
      if (apply) {
        await reload();
        setMessage("Import bol aplikovaný. Nové záznamy zostali v koncepte.");
      } else {
        setMessage("Preview importu je pripravený. Zatiaľ sa nič nezmenilo.");
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import sa nepodaril.");
    } finally {
      setImportPending(false);
    }
  }

  return (
    <div className={styles.root}>
      <section className={styles.summary} aria-label="Súhrn kalendára">
        <div><strong>{records.length}</strong><span>spolu</span></div>
        <div><strong>{counts.published}</strong><span>publikované</span></div>
        <div><strong>{counts.draft}</strong><span>koncepty</span></div>
        <div><strong>{counts.archived}</strong><span>archivované</span></div>
      </section>

      <section className={styles.toolbar} aria-label="Filtre kalendára">
        <label>Hľadať podľa mena alebo zdroja<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Meno alebo zdroj" /></label>
        <label>Mesiac<select value={month} onChange={(event) => setMonth(event.target.value)}><option value="">Všetky mesiace</option>{MONTHS.map((label, index) => <option value={index + 1} key={label}>{label}</option>)}</select></label>
        <label>Stav<select value={status} onChange={(event) => setStatus(event.target.value as DogNameDayStatus | "all")}><option value="all">Všetky stavy</option><option value="draft">Koncept</option><option value="published">Publikované</option><option value="archived">Archivované</option></select></label>
        <AdminActionButton variant="primary" onClick={openCreate}>+ Nové meno</AdminActionButton>
      </section>

      {message && <p className={styles.message} role="status">{message}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <section className={styles.tableWrap} aria-label="Záznamy psích menín">
        <table className={styles.table}>
          <thead><tr><th>Dátum</th><th>Meno</th><th>Stav</th><th>Zdroj / proveniencia</th><th>Upravené</th><th>Akcie</th></tr></thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.id}>
                <td><strong>{record.day}. {MONTHS[record.month - 1]}</strong></td>
                <td><strong>{record.name}</strong><small>{record.normalizedName}</small></td>
                <td><span className={`${styles.status} ${styles[record.status]}`}>{statusLabel(record.status)}</span></td>
                <td className={styles.source}>{record.source}{record.note ? <small>{record.note}</small> : null}</td>
                <td><time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleDateString("sk-SK")}</time></td>
                <td><div className={styles.rowActions}><AdminActionButton variant="secondary" onClick={() => openEdit(record)}>Upraviť</AdminActionButton>{record.status !== "archived" && <AdminActionButton variant="destructive" onClick={() => setArchiveTarget(record)}>Archivovať</AdminActionButton>}</div></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6} className={styles.empty}>Žiadne záznamy pre zvolené filtre.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className={styles.importPanel} aria-labelledby="name-day-import-title">
        <div><span>Kontrolovaný import</span><h2 id="name-day-import-title">JSON import bez automatickej publikácie</h2><p>Povolené polia: <code>month</code>, <code>day</code>, <code>name</code>, <code>source</code>, voliteľne <code>note</code>. Import vždy vytvorí nové položky ako koncept.</p></div>
        <textarea value={importText} onChange={(event) => { setImportText(event.target.value); setImportPlan(null); }} spellCheck={false} aria-label="JSON dáta na import" />
        {importPlan && <div className={styles.importSummary} aria-live="polite"><strong>INSERT {importPlan.summary.INSERT}</strong><strong>UPDATE {importPlan.summary.UPDATE}</strong><strong>SKIP {importPlan.summary.SKIP}</strong><strong>ERROR {importPlan.summary.ERROR}</strong>{importPlan.actions.filter((action) => action.action === "ERROR").slice(0, 5).map((action) => <p key={action.index}>Riadok {action.index + 1}: {action.message}</p>)}</div>}
        <div className={styles.importActions}><AdminActionButton variant="secondary" disabled={importPending} onClick={() => runImport(false)}>Preview</AdminActionButton><AdminActionButton variant="primary" disabled={importPending || !importPlan || importPlan.summary.ERROR > 0} onClick={() => runImport(true)}>Aplikovať bezpečný import</AdminActionButton></div>
      </section>

      <AdminModalDialog
        open={editorOpen}
        title={form.id ? "Upraviť psie meniny" : "Nové psie meniny"}
        description="Publikuj iba záznam s overeným a dohľadateľným zdrojom."
        onClose={() => !saving && setEditorOpen(false)}
        footer={<><AdminActionButton variant="neutral" disabled={saving} onClick={() => setEditorOpen(false)}>Zrušiť</AdminActionButton><AdminActionButton variant="primary" disabled={saving} onClick={saveRecord}>{saving ? "Ukladám…" : "Uložiť"}</AdminActionButton></>}
      >
        <div className={styles.formGrid}>
          <label>Mesiac<select value={form.month} onChange={(event) => setForm((current) => ({ ...current, month: Number(event.target.value) }))}>{MONTHS.map((label, index) => <option value={index + 1} key={label}>{label}</option>)}</select></label>
          <label>Deň<input type="number" min={1} max={31} value={form.day} onChange={(event) => setForm((current) => ({ ...current, day: Number(event.target.value) }))} /></label>
          <label className={styles.full}>Meno<input value={form.name} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Stav<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as DogNameDayStatus }))}><option value="draft">Koncept</option><option value="published">Publikované</option><option value="archived">Archivované</option></select></label>
          <label className={styles.full}>Zdroj / proveniencia<textarea value={form.source} maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} placeholder="URL, názov zdroja alebo interná poznámka k overeniu" /></label>
          <label className={styles.full}>Poznámka (voliteľné)<textarea value={form.note} maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
        </div>
      </AdminModalDialog>

      <AdminDestructiveConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archivovať záznam?"
        description={archiveTarget ? `${archiveTarget.name} (${archiveTarget.day}. ${MONTHS[archiveTarget.month - 1]}) sa prestane verejne používať.` : undefined}
        affectedCount={1}
        affectedLabel="záznam"
        confirmLabel="Archivovať"
        pending={saving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={archiveRecord}
      />
    </div>
  );
}
