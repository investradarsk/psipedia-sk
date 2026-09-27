"use client";

import { useMemo, useState } from "react";

type CanonicalAddress = {
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: string;
  serviceAddressConfirmation?: string;
};

type PreviewItem = {
  index: number;
  profileId: number | null;
  name: string;
  category: string;
  action: string;
  confidence: string;
  sourceUrl: string;
  currentAddress: CanonicalAddress | null;
  proposedAddress: CanonicalAddress | null;
  verifiedAddress: CanonicalAddress | null;
  decision: string;
  reason: string;
  previewFingerprint: string | null;
  record: Record<string, unknown> | null;
};

type PreviewResponse = {
  schemaVersion: 1;
  dataset?: { label?: string; createdAt?: string };
  counters: Record<string, number>;
  items: PreviewItem[];
};

type DatasetInput = {
  schemaVersion: unknown;
  dataset?: unknown;
  profiles: unknown[];
};

type ApplyResult = {
  profileId: number;
  name: string;
  result: string;
  reason: string;
  verifiedAddress: CanonicalAddress | null;
  geo: unknown;
};

const APPLY_BATCH_SIZE = 20;
const PREVIEW_BATCH_SIZE = 20;
const TOKEN = "ADDRESS-RESEARCH-IMPORT";

function formatAddress(value: CanonicalAddress | null) {
  if (!value) return "—";
  const first = value.addressFormat === "STREET"
    ? [value.street, value.houseNumber].filter(Boolean).join(" ")
    : [value.city, value.houseNumber].filter(Boolean).join(" ");
  const second = [value.postalCode, value.city].filter(Boolean).join(" ");
  const locality = [value.district, value.region].filter(Boolean).join(", ");
  return [first, second, locality].filter(Boolean).join(" · ") || "—";
}

function isReady(item: PreviewItem) {
  return item.decision === "READY_UPDATE" || item.decision === "READY_FILL_MISSING";
}

function filterMatches(item: PreviewItem, filter: string) {
  if (filter === "ready") return isReady(item);
  if (filter === "no-change") return item.decision === "NO_CHANGE";
  if (filter === "blocked") return !isReady(item) && item.decision !== "NO_CHANGE" && item.decision !== "KEEP";
  return true;
}

export default function AdminAddressResearchImport() {
  const [fileName, setFileName] = useState("");
  const [dataset, setDataset] = useState<unknown>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [processed, setProcessed] = useState(0);
  const [applyTotal, setApplyTotal] = useState(0);
  const [previewProcessed, setPreviewProcessed] = useState(0);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewComplete, setPreviewComplete] = useState(false);

  const visibleItems = useMemo(
    () => (preview?.items ?? []).filter((item) => filterMatches(item, filter)),
    [preview, filter],
  );
  const readyItems = useMemo(
    () => previewComplete
      ? (preview?.items ?? []).filter((item) => isReady(item) && item.previewFingerprint && item.record)
      : [],
    [preview, previewComplete],
  );

  async function onFile(file: File | null) {
    setError("");
    setPreview(null);
    setApplyResults([]);
    setProcessed(0);
    setApplyTotal(0);
    setPreviewProcessed(0);
    setPreviewTotal(0);
    setPreviewComplete(false);
    setDataset(null);
    setFileName(file?.name ?? "");
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("JSON je väčší ako povolených 20 MB.");
      return;
    }
    try {
      const text = await file.text();
      setDataset(JSON.parse(text));
    } catch {
      setError("Súbor nie je platný JSON.");
    }
  }

  async function runPreview() {
    if (!dataset) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setPreviewProcessed(0);
    setPreviewTotal(0);
    setPreviewComplete(false);
    setApplyResults([]);
    try {
      const validationResponse = await fetch("/api/admin/address-research-import/preview?validateOnly=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dataset),
        cache: "no-store",
      });
      const validation = await validationResponse.json() as { total?: number; error?: string };
      if (!validationResponse.ok) throw new Error(validation.error || "Validácia datasetu zlyhala.");

      const raw = dataset as DatasetInput;
      if (!Array.isArray(raw.profiles)) throw new Error("profiles musí byť array.");
      const total = Number(validation.total ?? raw.profiles.length);
      setPreviewTotal(total);

      const accumulatedItems: PreviewItem[] = [];
      const accumulatedCounters: Record<string, number> = {};
      let datasetMeta: PreviewResponse["dataset"] | undefined;

      for (let offset = 0; offset < raw.profiles.length; offset += PREVIEW_BATCH_SIZE) {
        const chunk = raw.profiles.slice(offset, offset + PREVIEW_BATCH_SIZE);
        const batchDataset = { ...raw, profiles: chunk };
        const response = await fetch(`/api/admin/address-research-import/preview?baseIndex=${offset}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batchDataset),
          cache: "no-store",
        });
        const body = await response.json() as PreviewResponse & { error?: string };
        if (!response.ok) throw new Error(body.error || `Preview batch ${Math.floor(offset / PREVIEW_BATCH_SIZE) + 1} zlyhal.`);

        datasetMeta = body.dataset ?? datasetMeta;
        accumulatedItems.push(...body.items);
        for (const [key, value] of Object.entries(body.counters)) {
          accumulatedCounters[key] = (accumulatedCounters[key] ?? 0) + value;
        }
        const currentProcessed = Math.min(offset + chunk.length, total);
        setPreviewProcessed(currentProcessed);
        setPreview({
          schemaVersion: 1,
          dataset: datasetMeta,
          counters: { ...accumulatedCounters },
          items: [...accumulatedItems],
        });
      }

      setPreviewComplete(accumulatedItems.length === total);
    } catch (cause) {
      setPreviewComplete(false);
      setError(cause instanceof Error ? cause.message : "Preview zlyhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    if (!previewComplete || previewProcessed !== previewTotal || token !== TOKEN || readyItems.length === 0) return;
    setBusy(true);
    setError("");
    setApplyResults([]);
    setProcessed(0);
    setApplyTotal(readyItems.length);
    const accumulated: ApplyResult[] = [];
    try {
      for (let offset = 0; offset < readyItems.length; offset += APPLY_BATCH_SIZE) {
        const chunk = readyItems.slice(offset, offset + APPLY_BATCH_SIZE).map((item) => ({
          record: item.record,
          previewFingerprint: item.previewFingerprint,
        }));
        const response = await fetch("/api/admin/address-research-import/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmationToken: token, records: chunk }),
          cache: "no-store",
        });
        const body = await response.json() as { results?: ApplyResult[]; error?: string };
        if (!response.ok) throw new Error(body.error || `Apply batch ${Math.floor(offset / APPLY_BATCH_SIZE) + 1} zlyhal.`);
        accumulated.push(...(body.results ?? []));
        setApplyResults([...accumulated]);
        setProcessed(Math.min(offset + chunk.length, readyItems.length));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Apply zlyhalo.");
    } finally {
      setBusy(false);
    }
  }

  const applySummary = useMemo(() => {
    const count = (result: string) => applyResults.filter((item) => item.result === result).length;
    return {
      written: count("UPDATED"),
      noChange: count("NO_CHANGE"),
      stale: count("STALE_PREVIEW"),
      skipped: count("SKIPPED") + count("IDENTITY_MISMATCH"),
      providerRejected: count("PROVIDER_REJECTED") + count("PROVIDER_AMBIGUOUS"),
      errors: count("ERROR") + count("PROVIDER_ERROR"),
    };
  }, [applyResults]);

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: "32px 24px 64px" }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>DIRECTORY</p>
        <h1 style={{ margin: "6px 0 8px" }}>Import research adries</h1>
        <p style={{ margin: 0, maxWidth: 900 }}>
          Kontrolovaný JSON preview a apply overených canonical SERVICE adries. Importer nevytvára profily, nečíta XLSX a exact GEO vzniká iba cez existujúci provider + GEO lifecycle.
        </p>
      </div>

      <section style={{ border: "1px solid #d9d9d9", borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>1. JSON dataset</h2>
        <input type="file" accept=".json,application/json" onChange={(event) => onFile(event.target.files?.[0] ?? null)} disabled={busy} />
        {fileName ? <p><strong>Súbor:</strong> {fileName}</p> : null}
        <button type="button" onClick={runPreview} disabled={!dataset || busy} style={{ padding: "10px 16px", fontWeight: 700 }}>
          {busy && !preview ? "Kontrolujem…" : "Skontrolovať a zobraziť Preview"}
        </button>
        {previewTotal > 0 ? <p><strong>Preview:</strong> {previewProcessed} / {previewTotal}{!previewComplete && !busy ? " · INCOMPLETE" : ""}</p> : null}
        {error ? <p role="alert" style={{ color: "#a40000", fontWeight: 700 }}>{error}</p> : null}
      </section>

      {preview ? (
        <>
          <section style={{ border: "1px solid #d9d9d9", borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <h2 style={{ marginTop: 0 }}>2. Preview</h2>
            {preview.dataset?.label ? <p><strong>Dataset:</strong> {preview.dataset.label}</p> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {[
                "TOTAL", "MATCHED", "READY_UPDATE", "READY_FILL_MISSING", "KEEP", "NO_CHANGE", "REVIEW",
                "NOT_FOUND", "NO_PUBLIC_SERVICE_ADDRESS", "SKIPPED_CONFIDENCE", "STALE_DATASET",
                "IDENTITY_MISMATCH", "ACTION_CONFLICT", "INVALID", "ARCHIVED",
                "PROVIDER_REJECTED", "PROVIDER_AMBIGUOUS", "PROVIDER_ERROR",
              ].map((key) => (
                <span key={key} style={{ border: "1px solid #ddd", borderRadius: 999, padding: "6px 9px", fontSize: 12 }}>
                  <strong>{key}</strong>: {preview.counters[key] ?? 0}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[
                ["all", "All"],
                ["ready", "Ready"],
                ["blocked", "Review/blocked"],
                ["no-change", "No change"],
              ].map(([value, label]) => (
                <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ overflow: "auto", maxHeight: "62vh", border: "1px solid #e5e5e5", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1350, fontSize: 13 }}>
                <thead style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
                  <tr>
                    {["ID", "Názov", "Kategória", "Action", "Confidence", "Current", "Proposed", "Source", "Provider verified", "Decision", "Reason"].map((heading) => (
                      <th key={heading} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.index}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.profileId ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.name || "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.category || "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.action || "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.confidence || "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{formatAddress(item.currentAddress)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{formatAddress(item.proposedAddress)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", maxWidth: 220, overflowWrap: "anywhere" }}>
                        {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">zdroj</a> : "—"}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{formatAddress(item.verifiedAddress)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 700 }}>{item.decision}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ border: "1px solid #d9d9d9", borderRadius: 14, padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>3. Apply</h2>
            <p>
              Scope: <strong>všetky READY_UPDATE + READY_FILL_MISSING</strong> — {readyItems.length} položiek.
              Apply sa odošle automaticky po interných batchoch po {APPLY_BATCH_SIZE}.
            </p>
            <label style={{ display: "block", marginBottom: 8 }}>
              Potvrdenie: zadaj presne <code>{TOKEN}</code>
            </label>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              style={{ width: "min(520px, 100%)", padding: 9, marginRight: 8 }}
              disabled={busy}
            />
            <button type="button" onClick={runApply} disabled={busy || !previewComplete || previewProcessed !== previewTotal || token !== TOKEN || readyItems.length === 0} style={{ padding: "10px 16px", fontWeight: 700 }}>
              Aplikovať bezpečné adresy
            </button>
            {applyTotal > 0 ? <p><strong>Progress:</strong> {processed} / {applyTotal} spracovaných</p> : null}
            {applyResults.length > 0 ? (
              <>
                <p>
                  <strong>Výsledok:</strong> written {applySummary.written} · noChange {applySummary.noChange} · stale {applySummary.stale} · skipped {applySummary.skipped} · providerRejected {applySummary.providerRejected} · errors {applySummary.errors}
                </p>
                <div style={{ overflow: "auto", maxHeight: 360 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, fontSize: 13 }}>
                    <thead>
                      <tr>{["ID", "Názov", "Result", "Reason", "Verified", "GEO"].map((h) => <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {applyResults.map((item, index) => (
                        <tr key={`${item.profileId}-${index}`}>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.profileId}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.name}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 700 }}>{item.result}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.reason}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{formatAddress(item.verifiedAddress)}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}><code>{JSON.stringify(item.geo)}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
