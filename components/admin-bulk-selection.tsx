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
  skips: Array<{
    reason: "already-target-state" | "record-no-longer-exists" | "invalid-lifecycle" | "record-changed-since-snapshot";
    count: number;
  }>;
};

const skipLabels: Record<PreflightResult["skips"][number]["reason"], string> = {
  "already-target-state": "už sú v cieľovom stave",
  "record-no-longer-exists": "záznam už neexistuje",
  "invalid-lifecycle": "neplatný lifecycle",
  "record-changed-since-snapshot": "záznam sa od snapshotu zmenil",
};

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

export function useAdminBulkSelection({
  module,
  membershipFingerprint,
  pageIds,
  resultCount,
  supportsAllMatching = true,
}: {
  module: string;
  membershipFingerprint: string;
  pageIds: number[];
  resultCount: number;
  supportsAllMatching?: boolean;
}) {
  const [selection, setSelection] = useState<AdminBulkSelectionState>({ mode: "explicit", ids: [] });
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const key = storageKey(module);
    let nextSelection: AdminBulkSelectionState = { mode: "explicit", ids: [] };
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const stored = JSON.parse(raw) as { membershipFingerprint?: unknown; selection?: unknown };
        const normalized = stored.membershipFingerprint === membershipFingerprint
          ? normalizeStoredState(stored.selection)
          : null;
        if (normalized && (supportsAllMatching || normalized.mode !== "all-matching")) {
          nextSelection = normalized;
        } else {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      sessionStorage.removeItem(key);
    }

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSelection(nextSelection);
      setRestored(true);
    });
    return () => {
      active = false;
    };
  }, [membershipFingerprint, module, supportsAllMatching]);

  useEffect(() => {
    if (!restored) return;
    const key = storageKey(module);
    const selectedCount = selection.mode === "all-matching" ? resultCount : selection.ids.length;
    if (selectedCount === 0) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify({ membershipFingerprint, selection }));
  }, [membershipFingerprint, module, restored, resultCount, selection]);

  const explicitIds = selection.mode === "explicit" ? selection.ids : [];
  const explicitSet = new Set(explicitIds);
  const currentPageSelected = selection.mode === "all-matching"
    ? pageIds.length
    : pageIds.filter((id) => explicitSet.has(id)).length;
  const selectedCount = selection.mode === "all-matching" ? resultCount : explicitIds.length;
  const currentPageAllSelected = pageIds.length > 0 && currentPageSelected === pageIds.length;
  const currentPageSomeSelected = currentPageSelected > 0 && !currentPageAllSelected;

  function toggleRow(id: number) {
    if (!restored) return;
    setSelection((current) => {
      if (current.mode === "all-matching") {
        return { mode: "explicit", ids: pageIds.filter((pageId) => pageId !== id) };
      }
      const ids = new Set(current.ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { mode: "explicit", ids: [...ids] };
    });
  }

  function toggleCurrentPage(checked: boolean) {
    if (!restored) return;
    setSelection((current) => {
      if (!checked && current.mode === "all-matching") return { mode: "explicit", ids: [] };
      const ids = new Set(current.mode === "explicit" ? current.ids : []);
      for (const id of pageIds) {
        if (checked) ids.add(id);
        else ids.delete(id);
      }
      return { mode: "explicit", ids: [...ids] };
    });
  }

  return {
    selection,
    ready: restored,
    selectedCount,
    currentPageSelected,
    currentPageAllSelected,
    currentPageSomeSelected,
    isSelected: (id: number) => selection.mode === "all-matching" || explicitSet.has(id),
    toggleRow,
    toggleCurrentPage,
    selectAllMatching: () => {
      if (restored && supportsAllMatching) setSelection({ mode: "all-matching" });
    },
    clear: () => setSelection({ mode: "explicit", ids: [] }),
  };
}

export function BulkSelectionCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={className ?? styles.checkLabel}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked)}
      />
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
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [error, setError] = useState("");
  const isArticles = module === "articles";
  const canOfferAllMatching = (
    supportsAllMatching
    && selection.mode === "explicit"
    && currentPageAllSelected
    && resultCount > pageIds.length
  );

  function openDialog(nextAction: "publish" | "move-to-draft", trigger: HTMLButtonElement) {
    restoreFocusRef.current = trigger;
    setAction(nextAction);
    setResult(null);
    setError("");
    dialogRef.current?.showModal();
    requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>("[data-preflight-button]")?.focus();
    });
  }

  function closeDialog() {
    dialogRef.current?.close();
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
  }

  async function runPreflight() {
    if (pending || selectedCount === 0) return;
    setPending(true);
    setResult(null);
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
      if (payload.snapshot.filterFingerprint !== membershipFingerprint) {
        throw new Error("Server vrátil snapshot pre iný filter.");
      }
      setResult(payload);
    } catch (preflightError) {
      setError(preflightError instanceof Error ? preflightError.message : "Preflight zlyhal.");
    } finally {
      setPending(false);
    }
  }

  const actionLabel = action === "publish" ? "Publikovať" : "Presunúť do konceptov";
  const pageSelectionLabel = isArticles
    ? "Vybrať všetky články na tejto strane"
    : "Vybrať všetky profily na tejto strane";
  const dialogObjectLabel = isArticles ? "článkov" : "profilov";
  const noMutationLabel = isArticles ? "Články" : "Profily";

  return (
    <>
      <div className={styles.pageSelect}>
        <BulkSelectionCheckbox
          checked={currentPageAllSelected}
          indeterminate={currentPageSomeSelected}
          disabled={!selectionReady}
          label={pageSelectionLabel}
          onChange={toggleCurrentPage}
        />
        {currentPageSelected > 0 && (
          <span>{currentPageSelected} položiek vybraných na tejto strane</span>
        )}
        {canOfferAllMatching && (
          <button className={styles.selectAllButton} type="button" onClick={selectAllMatching}>
            Vybrať všetkých {resultCount} výsledkov zodpovedajúcich filtrom
          </button>
        )}
        {selection.mode === "all-matching" && supportsAllMatching && (
          <strong>Vybraných všetkých {resultCount} výsledkov</strong>
        )}
      </div>

      {selectedCount > 0 && (
        <aside className={styles.toolbar} aria-label="Hromadný výber">
          <div className={styles.summary} aria-live="polite" aria-atomic="true">
            <strong>Vybrané: {selectedCount}</strong>
            <span>{selection.mode === "all-matching" ? "Všetky výsledky filtra" : "Explicitný výber"}</span>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={(event) => openDialog("publish", event.currentTarget)}>
              Skontrolovať publikovanie
            </button>
            <button type="button" onClick={(event) => openDialog("move-to-draft", event.currentTarget)}>
              Skontrolovať presun do konceptov
            </button>
            <button className={styles.clearButton} type="button" onClick={clear}>
              Zrušiť výber
            </button>
          </div>
        </aside>
      )}

      <dialog
        className={styles.dialog}
        ref={dialogRef}
        aria-labelledby="bulk-preflight-title"
        onClose={() => {
          setPending(false);
          requestAnimationFrame(() => restoreFocusRef.current?.focus());
        }}
      >
        <div className={styles.dialogBody}>
          <h2 id="bulk-preflight-title">{actionLabel} {selectedCount} {dialogObjectLabel}?</h2>
          <p>Táto fáza vykoná iba serverovú kontrolu a vytvorí krátkodobý selection snapshot. {noMutationLabel} nezmení.</p>

          <div aria-live="polite" aria-atomic="true">
            {pending && <p>Kontrolujem výber…</p>}
            {error && <p role="alert">{error}</p>}
            {result && (
              <div className={styles.preflightResult}>
                <strong>{result.matched} výsledkov / {result.eligible} eligible / {result.wouldBeSkipped} by boli preskočené</strong>
                {result.skips.length > 0 && (
                  <ul>
                    {result.skips.map((skip) => (
                      <li key={skip.reason}>{skip.count} × {skipLabels[skip.reason]}</li>
                    ))}
                  </ul>
                )}
                <span>Snapshot platí do {new Date(result.snapshot.expiresAt).toLocaleTimeString("sk-SK")}.</span>
              </div>
            )}
          </div>

          <div className={styles.dialogActions}>
            <button type="button" onClick={closeDialog}>Zavrieť</button>
            <button
              data-preflight-button
              type="button"
              disabled={pending}
              onClick={() => void runPreflight()}
            >
              {pending ? "Kontrolujem…" : "Spustiť preflight"}
            </button>
            <button className={styles.futureAction} type="button" disabled>
              Vykonať hromadnú zmenu — ďalšia fáza
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export { styles as adminBulkSelectionStyles };
