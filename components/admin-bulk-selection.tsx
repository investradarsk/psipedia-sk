"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import styles from "./admin-bulk-selection.module.css";

export type AdminBulkSelectionState =
  | { mode: "explicit"; ids: number[] }
  | { mode: "all-matching" };

type SkipReason = "already-target-state" | "record-no-longer-exists" | "invalid-lifecycle" | "record-changed-since-snapshot";

type PreflightResult = {
  snapshot: {
    id: string;
    module: string;
    action: "publish" | "move-to-draft";
    mode: "explicit" | "all-matching";
    filterFingerprint: string;
    createdAt: string;
    expiresAt: string;
  };
  matched: number;
  eligible: number;
  wouldBeSkipped: number;
  skips: Array<{ reason: SkipReason; count: number }>;
};

type ExecutionResult = {
  snapshotId: string;
  action: "publish" | "move-to-draft";
  requested: number;
  updated: Array<{ id: number }>;
  skipped: Array<{ id: number; reason: SkipReason }>;
  failed: Array<{ id: number; reason: string }>;
  counts: { requested: number; updated: number; skipped: number; failed: number };
};

const skipLabels: Record<SkipReason, string> = {
  "already-target-state": "už sú v cieľovom stave",
  "record-no-longer-exists": "záznam už neexistuje",
  "invalid-lifecycle": "neplatný lifecycle",
  "record-changed-since-snapshot": "záznam sa od snapshotu zmenil",
};

const emptySelection: AdminBulkSelectionState = { mode: "explicit", ids: [] };

function storageKey(module: string) {
  return `psipedia-admin-bulk-selection:${module}`;
}

function normalizeStoredState(value: unknown): AdminBulkSelectionState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { mode?: unknown; ids?: unknown };
  if (candidate.mode === "all-matching") return { mode: "all-matching" };
  if (candidate.mode === "explicit" && Array.isArray(candidate.ids)) {
    const ids = candidate.ids.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0);
    return { mode: "explicit", ids: [...new Set(ids)] };
  }
  return null;
}

export function useAdminBulkSelection({ module, membershipFingerprint, pageIds, resultCount, supportsAllMatching = true }: {
  module: string;
  membershipFingerprint: string;
  pageIds: number[];
  resultCount: number;
  supportsAllMatching?: boolean;
}) {
  const [selectionState, setSelectionState] = useState<{ membershipFingerprint: string | null; selection: AdminBulkSelectionState }>({
    membershipFingerprint: null,
    selection: emptySelection,
  });

  useEffect(() => {
    const key = storageKey(module);
    let nextSelection: AdminBulkSelectionState = emptySelection;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const stored = JSON.parse(raw) as { membershipFingerprint?: unknown; selection?: unknown };
        const normalized = stored.membershipFingerprint === membershipFingerprint ? normalizeStoredState(stored.selection) : null;
        if (normalized && (supportsAllMatching || normalized.mode !== "all-matching")) nextSelection = normalized;
        else sessionStorage.removeItem(key);
      }
    } catch {
      sessionStorage.removeItem(key);
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setSelectionState({ membershipFingerprint, selection: nextSelection });
    });
    return () => { active = false; };
  }, [membershipFingerprint, module, supportsAllMatching]);

  const ready = selectionState.membershipFingerprint === membershipFingerprint;
  const selection = ready ? selectionState.selection : emptySelection;

  useEffect(() => {
    if (!ready) return;
    const key = storageKey(module);
    const selectedCount = selection.mode === "all-matching" ? resultCount : selection.ids.length;
    if (selectedCount === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify({ membershipFingerprint, selection }));
  }, [membershipFingerprint, module, ready, resultCount, selection]);

  const explicitIds = selection.mode === "explicit" ? selection.ids : [];
  const explicitSet = new Set(explicitIds);
  const currentPageSelected = selection.mode === "all-matching" ? pageIds.length : pageIds.filter((id) => explicitSet.has(id)).length;
  const selectedCount = selection.mode === "all-matching" ? resultCount : explicitIds.length;
  const currentPageAllSelected = pageIds.length > 0 && currentPageSelected === pageIds.length;
  const currentPageSomeSelected = currentPageSelected > 0 && !currentPageAllSelected;

  function updateSelection(updater: (current: AdminBulkSelectionState) => AdminBulkSelectionState) {
    if (!ready) return;
    setSelectionState((current) => current.membershipFingerprint !== membershipFingerprint
      ? current
      : { ...current, selection: updater(current.selection) });
  }

  function toggleRow(id: number) {
    updateSelection((current) => {
      if (current.mode === "all-matching") return { mode: "explicit", ids: pageIds.filter((pageId) => pageId !== id) };
      const ids = new Set(current.ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { mode: "explicit", ids: [...ids] };
    });
  }

  function toggleCurrentPage(checked: boolean) {
    updateSelection((current) => {
      if (!checked && current.mode === "all-matching") return emptySelection;
      const ids = new Set(current.mode === "explicit" ? current.ids : []);
      for (const id of pageIds) checked ? ids.add(id) : ids.delete(id);
      return { mode: "explicit", ids: [...ids] };
    });
  }

  return {
    selection,
    ready,
    selectedCount,
    currentPageSelected,
    currentPageAllSelected,
    currentPageSomeSelected,
    isSelected: (id: number) => selection.mode === "all-matching" || explicitSet.has(id),
    toggleRow,
    toggleCurrentPage,
    selectAllMatching: () => { if (supportsAllMatching) updateSelection(() => ({ mode: "all-matching" })); },
    clear: () => updateSelection(() => emptySelection),
  };
}

export function BulkSelectionCheckbox({ checked, indeterminate = false, disabled = false, label, onChange, className }: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <label className={className ?? styles.checkLabel}>
      <input ref={ref} type="checkbox" checked={checked} disabled={disabled} aria-label={label}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function AdminBulkSelectionControls({
  module,
  membershipFilter,
  membershipFingerprint,
  resultCount,
  pageIds,
  selection,
  selectionReady,
  selectedCount,
  currentPageSelected,
  currentPageAllSelected,
  currentPageSomeSelected,
  toggleCurrentPage,
  selectAllMatching,
  clear,
  supportsAllMatching = true,
}: {
  module: "directory" | "articles";
  membershipFilter: unknown;
  membershipFingerprint: string;
  resultCount: number;
  pageIds: number[];
  selection: AdminBulkSelectionState;
  selectionReady: boolean;
  selectedCount: number;
  currentPageSelected: number;
  currentPageAllSelected: boolean;
  currentPageSomeSelected: boolean;
  toggleCurrentPage: (checked: boolean) => void;
  selectAllMatching: () => void;
  clear: () => void;
  supportsAllMatching?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  const [action, setAction] = useState<"publish" | "move-to-draft">("publish");
  const [dialogSelectedCount, setDialogSelectedCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState("");
  const isArticles = module === "articles";
  const canOfferAllMatching = supportsAllMatching && selection.mode === "explicit" && currentPageAllSelected && resultCount > pageIds.length;

  function openDialog(nextAction: "publish" | "move-to-draft", trigger: HTMLButtonElement) {
    restoreFocusRef.current = trigger;
    setAction(nextAction);
    setDialogSelectedCount(selectedCount);
    setPreflight(null);
    setExecution(null);
    setError("");
    dialogRef.current?.showModal();
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>("[data-preflight-button]")?.focus());
  }

  function closeDialog() {
    dialogRef.current?.close();
    if (execution) {
      window.location.reload();
      return;
    }
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
  }

  async function runPreflight() {
    if (pending || selectedCount === 0) return;
    setPending(true);
    setPreflight(null);
    setExecution(null);
    setError("");
    try {
      const response = await fetch("/api/admin/bulk/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          module,
          action,
          selection: selection.mode === "all-matching"
            ? { mode: "all-matching", filter: membershipFilter }
            : { mode: "explicit", ids: selection.ids, filter: membershipFilter },
        }),
      });
      const payload = await response.json() as PreflightResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Preflight zlyhal.");
      if (payload.snapshot.filterFingerprint !== membershipFingerprint) throw new Error("Server vrátil snapshot pre iný filter.");
      setPreflight(payload);
    } catch (preflightError) {
      setError(preflightError instanceof Error ? preflightError.message : "Preflight zlyhal.");
    } finally {
      setPending(false);
    }
  }

  async function runExecution() {
    if (!isArticles || pending || !preflight || preflight.eligible === 0 || selection.mode !== "explicit") return;
    setPending(true);
    setExecution(null);
    setError("");
    try {
      const response = await fetch("/api/admin/bulk/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          module: "articles",
          action,
          snapshotId: preflight.snapshot.id,
          membershipFingerprint,
          selection: { mode: "explicit", ids: selection.ids },
        }),
      });
      const payload = await response.json() as ExecutionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Hromadná zmena zlyhala.");
      setExecution(payload);
      clear();
    } catch (executionError) {
      setError(executionError instanceof Error ? executionError.message : "Hromadná zmena zlyhala.");
    } finally {
      setPending(false);
    }
  }

  const actionLabel = action === "publish" ? "Publikovať" : "Presunúť do konceptov";
  const pageSelectionLabel = isArticles ? "Vybrať všetky články na tejto strane" : "Vybrať všetky profily na tejto strane";
  const dialogObjectLabel = isArticles ? "článkov" : "profilov";

  return (
    <>
      <div className={styles.pageSelect}>
        <BulkSelectionCheckbox checked={currentPageAllSelected} indeterminate={currentPageSomeSelected} disabled={!selectionReady}
          label={pageSelectionLabel} onChange={toggleCurrentPage} />
        {currentPageSelected > 0 && <span>{currentPageSelected} položiek vybraných na tejto strane</span>}
        {canOfferAllMatching && (
          <button className={styles.selectAllButton} type="button" onClick={selectAllMatching}>
            Vybrať všetkých {resultCount} výsledkov zodpovedajúcich filtrom
          </button>
        )}
        {selection.mode === "all-matching" && supportsAllMatching && <strong>Vybraných všetkých {resultCount} výsledkov</strong>}
      </div>

      {selectedCount > 0 && (
        <aside className={styles.toolbar} aria-label="Hromadný výber">
          <div className={styles.summary} aria-live="polite" aria-atomic="true">
            <strong>Vybrané: {selectedCount}</strong>
            <span>{selection.mode === "all-matching" ? "Všetky výsledky filtra" : "Explicitný výber"}</span>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={(event) => openDialog("publish", event.currentTarget)}>Skontrolovať publikovanie</button>
            <button type="button" onClick={(event) => openDialog("move-to-draft", event.currentTarget)}>Skontrolovať presun do konceptov</button>
            <button className={styles.clearButton} type="button" onClick={clear}>Zrušiť výber</button>
          </div>
        </aside>
      )}

      <dialog className={styles.dialog} ref={dialogRef} aria-labelledby="bulk-preflight-title"
        onClose={() => { setPending(false); if (!execution) requestAnimationFrame(() => restoreFocusRef.current?.focus()); }}>
        <div className={styles.dialogBody}>
          <h2 id="bulk-preflight-title">{actionLabel} {dialogSelectedCount} {dialogObjectLabel}?</h2>
          <p>Najprv server overí aktuálny lifecycle a vytvorí krátkodobý snapshot. Zmena sa vykoná až po potvrdení.</p>

          <div aria-live="polite" aria-atomic="true">
            {pending && <p>Spracúvam požiadavku…</p>}
            {error && <p role="alert">{error}</p>}
            {preflight && !execution && (
              <div className={styles.preflightResult}>
                <strong>{preflight.matched} výsledkov / {preflight.eligible} eligible / {preflight.wouldBeSkipped} by boli preskočené</strong>
                {preflight.skips.length > 0 && <ul>{preflight.skips.map((skip) => <li key={skip.reason}>{skip.count} × {skipLabels[skip.reason]}</li>)}</ul>}
                <span>Snapshot platí do {new Date(preflight.snapshot.expiresAt).toLocaleTimeString("sk-SK")}.</span>
              </div>
            )}
            {execution && (
              <div className={styles.preflightResult}>
                <strong>Hotovo: {execution.counts.updated} zmenených / {execution.counts.skipped} preskočených / {execution.counts.failed} zlyhaní</strong>
                {execution.skipped.length > 0 && (
                  <ul>{execution.skipped.map((item) => <li key={`${item.id}-${item.reason}`}>ID {item.id}: {skipLabels[item.reason]}</li>)}</ul>
                )}
                {execution.failed.length > 0 && (
                  <ul>{execution.failed.map((item) => <li key={item.id}>ID {item.id}: zmena zlyhala</li>)}</ul>
                )}
                <span>Výber bol vyčistený. Po zatvorení sa zoznam obnoví.</span>
              </div>
            )}
          </div>

          <div className={styles.dialogActions}>
            <button type="button" onClick={closeDialog}>{execution ? "Zavrieť a obnoviť" : "Zavrieť"}</button>
            {!execution && (
              <button data-preflight-button type="button" disabled={pending} onClick={() => void runPreflight()}>
                {pending ? "Kontrolujem…" : preflight ? "Preflight zopakovať" : "Spustiť preflight"}
              </button>
            )}
            {isArticles && preflight && !execution && (
              <button type="button" disabled={pending || preflight.eligible === 0 || selection.mode !== "explicit"} onClick={() => void runExecution()}>
                {pending ? "Vykonávam…" : `Potvrdiť a vykonať: ${actionLabel.toLowerCase()}`}
              </button>
            )}
            {!isArticles && <button className={styles.futureAction} type="button" disabled>Vykonať hromadnú zmenu — ďalšia fáza</button>}
          </div>
        </div>
      </dialog>
    </>
  );
}

export { styles as adminBulkSelectionStyles };
