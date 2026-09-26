"use client";

import { useState } from "react";
import type { GeoDryRunItem } from "@/lib/geo-operations";

type SafeInitializationPreview = {
  requested: number;
  scanned: number;
  safe: number;
  availableUninitialized: number;
  alreadyInitializedSkipped: number;
  reviewBlocked: number;
  hidden: number;
  unclassified: number;
  selected: Array<{
    targetType: string;
    targetId: number;
    label: string;
    proposedVisibility: string | null;
    proposedPrecision: string | null;
    normalizedQuery: string | null;
    sourceFingerprint: string;
  }>;
};

type ExplicitPreviewItem = {
  targetType: string;
  targetId: number;
  canonicalExists: boolean;
  publishedEligible: boolean;
  name: string;
  category: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  canonicalAddressPresent: boolean;
  geoPointExists: boolean;
  currentGeocodeStatus: string | null;
  currentVisibility: string | null;
  currentPrecision: string | null;
  manualOverride: boolean;
  sourceFingerprint: string | null;
  resolvedSourceFingerprint: string | null;
  normalizedQuery: string | null;
  eligibleForInitialization: boolean;
  eligibleForClassification: boolean;
  eligibleForResolve: boolean;
  alreadyResolved: boolean;
  blockReason: string | null;
};

type ExplicitPreviewReport = {
  requested: number;
  matched: number;
  eligible: number;
  alreadyResolved: number;
  blocked: number;
  targetIds: number[];
  items: ExplicitPreviewItem[];
};

type BackfillChunkReport = {
  configured?: boolean;
  requested?: number;
  eligible?: number;
  attempted?: number;
  resolved?: number;
  needsReview?: number;
  failed?: number;
  pending?: number;
  skipped?: number;
  items?: Array<{ targetType: string; targetId: number; status: string; errorCode: string | null }>;
};

type A2PreviewItem = {
  targetId: number;
  label: string;
  action: string;
  reason: string;
  currentStatus: string | null;
  currentVisibility: string | null;
  currentPrecision: string | null;
  intendedAction: string;
};

type A2PreviewReport = {
  eligibleCount: number;
  selectedCandidateIds: number[];
  items: A2PreviewItem[];
};

export function AdminGeoOperations({ initialItems, providerConfigured }: {
  initialItems: GeoDryRunItem[];
  providerConfigured: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canary, setCanary] = useState<unknown>(null);
  const [initializeReport, setInitializeReport] = useState<unknown>(null);
  const [backfillReport, setBackfillReport] = useState<unknown>(null);
  const [targetType, setTargetType] = useState("");
  const [directoryCategory, setDirectoryCategory] = useState("");
  const [progress, setProgress] = useState("");
  const [safeInitialization, setSafeInitialization] = useState<SafeInitializationPreview | null>(null);
  const [explicitTargetType, setExplicitTargetType] = useState("DIRECTORY_PROFILE");
  const [explicitIdsText, setExplicitIdsText] = useState("");
  const [explicitVisibility, setExplicitVisibility] = useState("APPROXIMATE_PUBLIC");
  const [explicitPrecision, setExplicitPrecision] = useState("MUNICIPALITY");
  const [explicitPreview, setExplicitPreview] = useState<ExplicitPreviewReport | null>(null);
  const [explicitReport, setExplicitReport] = useState<unknown>(null);
  const [explicitConfirmed, setExplicitConfirmed] = useState(false);

  const [a2Preview, setA2Preview] = useState<A2PreviewReport | null>(null);
  const [a2IdsText, setA2IdsText] = useState("");
  const [a2CanaryReport, setA2CanaryReport] = useState<unknown>(null);
  const [a2Confirmed, setA2Confirmed] = useState(false);

  function parsedExplicitIds() {
    const raw = explicitIdsText.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    if (!raw.length) throw new Error("Zadaj 1 až 20 ID.");
    if (raw.length > 20) throw new Error("Maximum je 20 ID.");
    const ids = raw.map((value) => Number(value));
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error("ID musia byť kladné celé čísla.");
    if (new Set(ids).size !== ids.length) throw new Error("ID musia byť unique.");
    return ids;
  }

  function parsedA2Ids() {
    const raw = a2IdsText.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    if (!raw.length) throw new Error("Zadaj aspoň jedno DIRECTORY_PROFILE ID.");
    if (raw.length > 10) throw new Error("A2 canary povoľuje najviac 10 ID.");
    const ids = raw.map((value) => Number(value));
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error("A2 ID musia byť kladné celé čísla.");
    }
    if (new Set(ids).size !== ids.length) throw new Error("A2 ID musia byť unique.");
    return ids;
  }

  const explicitPreviewMatchesRequested = (() => {
    if (!explicitPreview) return false;
    try {
      const ids = parsedExplicitIds();
      return explicitPreview.requested === ids.length
        && explicitPreview.matched === ids.length
        && explicitPreview.targetIds.length === ids.length
        && explicitPreview.targetIds.every((id, index) => id === ids[index])
        && explicitPreview.items.every((item, index) => item.targetId === ids[index]);
    } catch {
      return false;
    }
  })();

  async function postAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/geo/operations", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    const body = await response.json() as { error?: string; report?: unknown };
    if (!response.ok) throw new Error(body.error || "Geo operácia zlyhala.");
    return body.report;
  }

  async function action(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage(""); setProgress("Spracúvam…");
    try {
      return await postAction(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Geo operácia zlyhala.");
      return null;
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function refresh() {
    const params = new URLSearchParams({ limit: "50" });
    if (targetType) params.set("target", targetType);
    if (targetType === "DIRECTORY_PROFILE" && directoryCategory.trim()) params.set("category", directoryCategory.trim());
    const response = await fetch(`/api/admin/geo/operations?${params.toString()}`, { cache: "no-store" });
    const body = await response.json() as {
      preview?: { items: GeoDryRunItem[] };
      safeInitialization?: SafeInitializationPreview | null;
      error?: string;
    };
    if (!response.ok || !body.preview) throw new Error(body.error || "Dry-run sa nepodarilo obnoviť.");
    setItems(body.preview.items);
    setSafeInitialization(body.safeInitialization ?? null);
  }

  return <div className="admin-event-editor" data-admin-geo-operations>
    <section className="admin-form-card">
      <h2>Production safety gates</h2>
      <p className="admin-help"><strong>Gate A:</strong> read-only production inventory ešte nebol vykonaný z tohto prostredia.</p>
      <p className="admin-help"><strong>Gate B:</strong> Slovak quality canary nie je automaticky spustený.</p>
      <p className="admin-help"><strong>Gate C:</strong> Geoapify provider {providerConfigured ? "má dostupný server-side secret." : "nemá dostupný server-side secret."}</p>
      <p className="admin-message admin-message--error"><strong>Full production backfill je hard-disabled.</strong> Táto stránka nemá akciu „geocode všetko“.</p>
    </section>

    <section className="admin-form-card" data-admin-a2-exact-automation>
      <h2>A2 — Exact directory automation</h2>
      <p className="admin-help">
        Bounded rollout pre canonical DIRECTORY_PROFILE exact GEO. <strong>Read-only preview — nič nemení a nevolá Geoapify.</strong>
      </p>
      <div className="admin-editor-actions">
        <button type="button" disabled={busy} onClick={async () => {
          setError(""); setMessage(""); setA2CanaryReport(null);
          const report = await action({ action: "a2-preview" });
          if (report) {
            setA2Preview(report as A2PreviewReport);
            setMessage("A2 preview obnovený. Bez writes a bez Geoapify callov.");
          }
        }}>Obnoviť A2 preview</button>
      </div>

      {a2Preview ? <>
        <p className="admin-help">
          Eligible <strong>{a2Preview.eligibleCount}</strong>
          {" · "}selected <strong>{a2Preview.selectedCandidateIds.length}</strong>
        </p>
        <p className="admin-help" style={{ overflowWrap: "anywhere" }}>
          <strong>Selected target IDs:</strong> {a2Preview.selectedCandidateIds.length ? a2Preview.selectedCandidateIds.join(", ") : "—"}
        </p>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Current status</th><th>Eligibility</th><th>Reason</th><th>Intended action</th></tr></thead>
            <tbody>{a2Preview.items.map((item) => <tr key={item.targetId}>
              <td>{item.targetId}</td>
              <td>{item.currentStatus ?? "—"}</td>
              <td>{item.action}</td>
              <td>{item.reason}</td>
              <td>{item.intendedAction}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : null}

      <div className="admin-field" style={{ marginTop: 16 }}>
        <label htmlFor="geo-a2-canary-ids">A2 canary — DIRECTORY_PROFILE IDs</label>
        <textarea
          id="geo-a2-canary-ids"
          rows={3}
          value={a2IdsText}
          onChange={(event) => {
            setA2IdsText(event.target.value);
            setA2Confirmed(false);
            setA2CanaryReport(null);
          }}
          placeholder="napr. 12, 18, 27 alebo jedno ID na riadok"
          style={{ width: "100%", maxWidth: "100%" }}
        />
        <p className="admin-help">
          Max. 10 positive integer IDs. <strong>Canary môže volať Geoapify a zapisovať reálne GEO výsledky.</strong>
          Neexistuje tu process-all akcia.
        </p>
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
        <input type="checkbox" checked={a2Confirmed} onChange={(event) => setA2Confirmed(event.target.checked)} />
        <span>Rozumiem, že A2 canary môže vykonať provider calls a GEO writes iba pre zadané ID.</span>
      </label>
      <div className="admin-editor-actions">
        <button type="button" disabled={busy || !providerConfigured || !a2Confirmed || !a2IdsText.trim()} onClick={async () => {
          let ids: number[];
          try { ids = parsedA2Ids(); }
          catch (caught) {
            setError(caught instanceof Error ? caught.message : "Neplatné A2 ID.");
            return;
          }
          if (!window.confirm("Spustiť A2 exact canary iba pre DIRECTORY_PROFILE ID: " + ids.join(", ") + "? Operácia môže volať Geoapify a zapisovať GEO výsledky.")) return;
          const report = await action({
            action: "a2-canary",
            targetIds: ids,
            confirm: "A2-CANARY",
          });
          if (report) {
            setA2CanaryReport(report);
            setMessage("A2 canary skončil. Skontroluj per-item report pred ďalším rolloutom.");
            setA2Confirmed(false);
          }
        }}>Spustiť A2 canary</button>
      </div>

      {a2CanaryReport ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(a2CanaryReport, null, 2)}</pre> : null}
    </section>

    <section className="admin-form-card" data-admin-explicit-geo-onboarding>
      <h2>Legacy explicit approximate onboarding</h2>
      <p className="admin-message admin-message--error">
        <strong>Legacy approximate onboarding — nepoužíva sa pre A2 exact rollout.</strong>
      </p>
      <p className="admin-help">
        Spracuje iba presne zadané ID (max. 20). Preview nerobí writes ani provider calls.
        Prvý production contract je striktne DIRECTORY_PROFILE + APPROXIMATE_PUBLIC + MUNICIPALITY.
      </p>
      <div className="admin-field-grid">
        <div className="admin-field">
          <label htmlFor="geo-explicit-target">Explicit target type</label>
          <select id="geo-explicit-target" value={explicitTargetType} onChange={(event) => {
            setExplicitTargetType(event.target.value);
            setExplicitPreview(null);
            setExplicitConfirmed(false);
          }}>
            <option value="DIRECTORY_PROFILE">DIRECTORY_PROFILE</option>
            <option value="MANAGED_EVENT">MANAGED_EVENT</option>
            <option value="ORGANIZATION_LOCATION">ORGANIZATION_LOCATION</option>
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="geo-explicit-visibility">Explicit visibility</label>
          <select id="geo-explicit-visibility" value={explicitVisibility} onChange={(event) => {
            setExplicitVisibility(event.target.value);
            setExplicitPreview(null);
            setExplicitConfirmed(false);
          }}>
            <option value="APPROXIMATE_PUBLIC">APPROXIMATE_PUBLIC</option>
            <option value="EXACT_PUBLIC">EXACT_PUBLIC</option>
            <option value="HIDDEN">HIDDEN</option>
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="geo-explicit-precision">Explicit precision</label>
          <select id="geo-explicit-precision" value={explicitPrecision} onChange={(event) => {
            setExplicitPrecision(event.target.value);
            setExplicitPreview(null);
            setExplicitConfirmed(false);
          }}>
            <option value="MUNICIPALITY">MUNICIPALITY</option>
            <option value="NEIGHBORHOOD">NEIGHBORHOOD</option>
            <option value="SERVICE_AREA">SERVICE_AREA</option>
            <option value="APPROXIMATE">APPROXIMATE</option>
            <option value="EXACT">EXACT</option>
          </select>
        </div>
      </div>
      <div className="admin-field">
        <label htmlFor="geo-explicit-ids">Canonical IDs</label>
        <textarea
          id="geo-explicit-ids"
          rows={3}
          value={explicitIdsText}
          onChange={(event) => {
            setExplicitIdsText(event.target.value);
            setExplicitPreview(null);
            setExplicitConfirmed(false);
          }}
          placeholder="3, 5, 10 alebo jedno ID na riadok"
        />
        <p className="admin-help">Iba explicitné positive integer IDs. Wildcard, range a category-only execution nie sú podporované.</p>
      </div>
      <div className="admin-editor-actions">
        <button type="button" disabled={busy || !explicitIdsText.trim()} onClick={async () => {
          setError(""); setMessage(""); setExplicitReport(null); setExplicitConfirmed(false);
          let ids: number[];
          try { ids = parsedExplicitIds(); }
          catch (caught) {
            setError(caught instanceof Error ? caught.message : "Neplatné ID.");
            return;
          }
          const report = await action({
            action: "explicit-preview",
            targetType: explicitTargetType,
            targetIds: ids,
            visibility: explicitVisibility,
            precision: explicitPrecision,
          });
          if (report) {
            setExplicitPreview(report as ExplicitPreviewReport);
            setMessage("Explicitný preview dokončený. Bez writes a bez provider callov.");
          }
        }}>Náhľad</button>
      </div>

      {explicitPreview ? <>
        <p className="admin-help">
          Requested {explicitPreview.requested} · matched {explicitPreview.matched} · eligible {explicitPreview.eligible}
          {" · "}already resolved {explicitPreview.alreadyResolved} · blocked {explicitPreview.blocked}
        </p>
        <p className="admin-help"><strong>Exact IDs:</strong> {explicitPreview.targetIds.join(", ")}</p>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Názov</th><th>Stav</th><th>Query</th><th>Block</th></tr></thead>
            <tbody>{explicitPreview.items.map((item) => <tr key={item.targetType + ":" + item.targetId}>
              <td>{item.targetId}</td>
              <td>{item.name || "—"}</td>
              <td>{item.alreadyResolved ? "ALREADY_RESOLVED" : item.eligibleForResolve ? "ELIGIBLE" : "BLOCKED"}</td>
              <td>{item.normalizedQuery ?? "—"}</td>
              <td>{item.blockReason ?? "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!explicitPreviewMatchesRequested && <p className="admin-message admin-message--error" role="alert">
          Preview target set sa nezhoduje so zadaným setom. Execute je zablokovaný.
        </p>}
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <input type="checkbox" checked={explicitConfirmed} onChange={(event) => setExplicitConfirmed(event.target.checked)} />
          Potvrdzujem presný target set a normalized queries z preview.
        </label>
        <div className="admin-editor-actions">
          <button type="button" disabled={busy || !providerConfigured || !explicitConfirmed || !explicitPreviewMatchesRequested} onClick={async () => {
            let ids: number[];
            try { ids = parsedExplicitIds(); }
            catch (caught) {
              setError(caught instanceof Error ? caught.message : "Neplatné ID.");
              return;
            }
            if (!window.confirm("Spustiť explicitný geo batch iba pre ID: " + ids.join(", ") + "?")) return;
            const report = await action({
              action: "explicit-onboard",
              targetType: explicitTargetType,
              targetIds: ids,
              visibility: explicitVisibility,
              precision: explicitPrecision,
              confirm: "EXPLICIT-ONBOARD",
            });
            if (report) {
              setExplicitReport(report);
              setMessage("Explicitný batch skončil. Skontroluj per-target report.");
              setExplicitConfirmed(false);
            }
          }}>Spustiť explicitný batch</button>
        </div>
      </> : null}

      {explicitReport ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(explicitReport, null, 2)}</pre> : null}
    </section>

    <section className="admin-form-card">
      <h2>Dry-run classifier & bounded rollout</h2>
      <p className="admin-help">Provider sa nevolá pri dry-rune ani inicializácii. Safe-only inicializácia preskočí review-blocked, HIDDEN a negeocodable kandidátov.</p>
      <div className="admin-field-grid">
        <div className="admin-field">
          <label htmlFor="geo-ops-target">Target type</label>
          <select id="geo-ops-target" value={targetType} onChange={(event) => {
            setTargetType(event.target.value);
            if (event.target.value !== "DIRECTORY_PROFILE") setDirectoryCategory("");
          }}>
            <option value="">Vyber target</option>
            <option value="MANAGED_EVENT">MANAGED_EVENT</option>
            <option value="DIRECTORY_PROFILE">DIRECTORY_PROFILE</option>
            <option value="ORGANIZATION_LOCATION">ORGANIZATION_LOCATION</option>
          </select>
        </div>
        {targetType === "DIRECTORY_PROFILE" && <div className="admin-field">
          <label htmlFor="geo-ops-category">Directory category</label>
          <input id="geo-ops-category" value={directoryCategory} onChange={(event) => setDirectoryCategory(event.target.value)} placeholder="napr. veterinari" />
        </div>}
      </div>
      <div className="admin-editor-actions">
        <button type="button" disabled={busy || !targetType || (targetType === "DIRECTORY_PROFILE" && !directoryCategory.trim())} onClick={async () => {
          if (!window.confirm(`Inicializovať najviac 20 SAFE kandidátov pre ${targetType}${directoryCategory ? ` / ${directoryCategory}` : ""}? Bez provider callov; review-blocked a HIDDEN sa preskočia.`)) return;
          const report = await action({
            action: "initialize",
            limit: 20,
            confirm: "INITIALIZE",
            safeOnly: true,
            targetType,
            directoryCategory: targetType === "DIRECTORY_PROFILE" ? directoryCategory.trim() : null,
          });
          if (report) {
            setInitializeReport(report);
            setMessage("Safe-only inicializácia geo riadkov skončila.");
            await refresh();
          }
        }}>Inicializovať SAFE max. 20</button>

        <button type="button" disabled={busy || !providerConfigured || !targetType || (targetType === "DIRECTORY_PROFILE" && !directoryCategory.trim())} onClick={async () => {
          if (!window.confirm(`Spustiť bounded backfill max. 5 pre ${targetType}${directoryCategory ? ` / ${directoryCategory}` : ""}? Operácia pôjde po jednom kandidátovi, aby bolo vidieť priebeh a aby jeden dlhý request nezablokoval celý batch.`)) return;

          const total = 5;
          const aggregate: BackfillChunkReport = {
            configured: true,
            requested: total,
            eligible: 0,
            attempted: 0,
            resolved: 0,
            needsReview: 0,
            failed: 0,
            pending: 0,
            skipped: 0,
            items: [],
          };

          setBusy(true);
          setError("");
          setMessage("");
          setBackfillReport(aggregate);

          try {
            for (let index = 1; index <= total; index += 1) {
              setProgress(`Backfill prebieha: ${index}/${total}…`);

              const raw = await postAction({
                action: "backfill",
                limit: 1,
                confirm: "BACKFILL-CHUNK",
                targetType,
                directoryCategory: targetType === "DIRECTORY_PROFILE" ? directoryCategory.trim() : null,
              });
              const report = (raw ?? {}) as BackfillChunkReport;

              aggregate.eligible = (aggregate.eligible ?? 0) + (report.eligible ?? 0);
              aggregate.attempted = (aggregate.attempted ?? 0) + (report.attempted ?? 0);
              aggregate.resolved = (aggregate.resolved ?? 0) + (report.resolved ?? 0);
              aggregate.needsReview = (aggregate.needsReview ?? 0) + (report.needsReview ?? 0);
              aggregate.failed = (aggregate.failed ?? 0) + (report.failed ?? 0);
              aggregate.pending = (aggregate.pending ?? 0) + (report.pending ?? 0);
              aggregate.skipped = (aggregate.skipped ?? 0) + (report.skipped ?? 0);
              aggregate.items = [...(aggregate.items ?? []), ...(report.items ?? [])];
              setBackfillReport({ ...aggregate, items: [...(aggregate.items ?? [])] });

              if ((report.eligible ?? 0) === 0 || (report.attempted ?? 0) === 0) break;
            }

            setMessage(`Bounded backfill skončil: ${aggregate.attempted ?? 0} spracovaných, ${aggregate.resolved ?? 0} resolved.`);
          } catch (caught) {
            const detail = caught instanceof Error ? caught.message : "Geo operácia zlyhala.";
            setError(`Backfill sa prerušil po ${aggregate.attempted ?? 0} potvrdených krokoch. Posledný request nemá potvrdený výsledok: ${detail}`);
          } finally {
            setProgress("");
            setBusy(false);
            try { await refresh(); } catch { /* Report zostáva viditeľný aj keď refresh zlyhá. */ }
          }
        }}>{busy && progress.startsWith("Backfill") ? "Backfill prebieha…" : "Backfill max. 5"}</button>

        <button type="button" disabled={busy || !providerConfigured || !targetType || (targetType === "DIRECTORY_PROFILE" && !directoryCategory.trim())} onClick={async () => {
          if (!window.confirm("Spustiť najviac 5 Geoapify canary requestov iba pre kandidátov bez povinného privacy review? Výsledky sa NEUKLADAJÚ do geo_points.")) return;
          const report = await action({
            action: "canary",
            limit: 5,
            confirm: "CANARY",
            targetType,
            directoryCategory: targetType === "DIRECTORY_PROFILE" ? directoryCategory.trim() : null,
          });
          if (report) { setCanary(report); setMessage("Canary skončil; nič sa nepublikovalo ani nepersistovalo."); }
        }}>Canary max. 5</button>

        <button type="button" disabled={busy} onClick={() => void refresh()}>Obnoviť dry-run</button>
      </div>
      {progress && <p className="admin-message" role="status" aria-live="polite"><strong>{progress}</strong></p>}
      {message && <p className="admin-message" role="status">{message}</p>}
      {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
    </section>

    {safeInitialization ? <section className="admin-form-card">
      <h2>Nasledujúci SAFE batch preview</h2>
      <p className="admin-help">
        Scanned {safeInitialization.scanned} · SAFE {safeInitialization.safe} · available uninitialized {safeInitialization.availableUninitialized}
        {" · "}already initialized skipped {safeInitialization.alreadyInitializedSkipped}
        {" · "}review blocked {safeInitialization.reviewBlocked} · hidden {safeInitialization.hidden} · unclassified {safeInitialization.unclassified}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead><tr><th>Target</th><th>Názov</th><th>Visibility</th><th>Precision</th><th>Query</th></tr></thead>
          <tbody>{safeInitialization.selected.map((item) => <tr key={`${item.targetType}:${item.targetId}`}>
            <td>{item.targetType} #{item.targetId}</td>
            <td>{item.label}</td>
            <td>{item.proposedVisibility ?? "UNCLASSIFIED"}</td>
            <td>{item.proposedPrecision ?? "—"}</td>
            <td>{item.normalizedQuery ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section> : null}

    <section className="admin-form-card">
      <h2>Prvých {items.length} dry-run kandidátov</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead><tr><th>Target</th><th>Názov</th><th>Návrh</th><th>Precision</th><th>Review</th><th>Query</th></tr></thead>
          <tbody>{items.map((item) => <tr key={`${item.targetType}:${item.targetId}`}>
            <td>{item.targetType} #{item.targetId}</td><td>{item.label}</td>
            <td>{item.proposedVisibility ?? "UNCLASSIFIED"}</td><td>{item.proposedPrecision ?? "—"}</td>
            <td>{item.requiresReview ? (item.reasonCode ?? "áno") : "nie"}</td>
            <td>{item.normalizedQuery ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    {initializeReport ? <section className="admin-form-card"><h2>Initialization report</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(initializeReport, null, 2)}</pre></section> : null}
    {backfillReport ? <section className="admin-form-card"><h2>Backfill report</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(backfillReport, null, 2)}</pre></section> : null}
    {canary ? <section className="admin-form-card"><h2>Canary report</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(canary, null, 2)}</pre></section> : null}
  </div>;
}
