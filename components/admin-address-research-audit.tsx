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
};

type AuditItem = {
  index: number;
  profileId: number | null;
  resolvedProfileId: number | null;
  name: string;
  category: string;
  psipediaUrl: string;
  researchAction: string;
  researchConfidence: string;
  sourceUrl: string;
  currentAddress: CanonicalAddress | null;
  currentServiceAddressConfirmation: string | null;
  currentAddressState: string | null;
  currentAddressReason: string | null;
  researchedAddress: CanonicalAddress | null;
  decision: string;
  differenceReason: string;
  updatedAt: string | null;
};

type AuditDataset = {
  schemaVersion: 1;
  dataset?: { label?: string };
  profiles: unknown[];
};

type AuditOutput = {
  schemaVersion: 1;
  summary: Record<string, number>;
  items: AuditItem[];
};

const BATCH_SIZE = 100;
const COUNTERS = [
  "TOTAL", "RESOLVED", "ALREADY_COMPLETE_SAME", "NEEDS_CONFIRMATION_ONLY", "NEEDS_FILL",
  "CURRENT_DIFFERS", "CURRENT_INVALID", "ARCHIVED", "ONLINE_ONLY", "IDENTITY_MISMATCH",
  "NOT_FOUND", "INVALID_RESEARCH", "NEEDS_CANONICAL_ACTION",
];

function formatAddress(value: CanonicalAddress | null) {
  if (!value) return "—";
  const first = value.addressFormat === "STREET"
    ? [value.street, value.houseNumber].filter(Boolean).join(" ")
    : [value.city, value.houseNumber].filter(Boolean).join(" ");
  return [first, [value.postalCode, value.city].filter(Boolean).join(" "), value.district, value.region].filter(Boolean).join(" · ");
}

function summarize(items: AuditItem[]) {
  const result: Record<string, number> = Object.fromEntries(COUNTERS.map((key) => [key, 0]));
  result.TOTAL = items.length;
  for (const item of items) {
    result[item.decision] = (result[item.decision] ?? 0) + 1;
    if (item.resolvedProfileId !== null) result.RESOLVED += 1;
  }
  result.NEEDS_CANONICAL_ACTION = (result.NEEDS_CONFIRMATION_ONLY ?? 0) + (result.NEEDS_FILL ?? 0) + (result.CURRENT_INVALID ?? 0);
  return result;
}

export default function AdminAddressResearchAudit() {
  const [dataset, setDataset] = useState<AuditDataset | null>(null);
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<AuditItem[]>([]);
  const [processed, setProcessed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const summary = useMemo(() => summarize(items), [items]);

  async function onFile(file: File | null) {
    setError("");
    setItems([]);
    setProcessed(0);
    setDataset(null);
    setFileName(file?.name ?? "");
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return setError("JSON je väčší ako povolených 20 MB.");
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      const candidate = parsed as { schemaVersion?: unknown; dataset?: { label?: string }; profiles?: unknown };
      if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.profiles)) throw new Error();
      setDataset({ schemaVersion: 1, dataset: candidate.dataset, profiles: candidate.profiles });
    } catch {
      setError("Súbor nie je platný audit JSON schemaVersion 1.");
    }
  }

  async function runAudit() {
    if (!dataset?.profiles?.length) return;
    setBusy(true);
    setError("");
    setItems([]);
    setProcessed(0);
    const accumulated: AuditItem[] = [];
    try {
      for (let offset = 0; offset < dataset.profiles.length; offset += BATCH_SIZE) {
        const profiles = dataset.profiles.slice(offset, offset + BATCH_SIZE);
        const response = await fetch("/api/admin/address-research-import/audit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ schemaVersion: 1, dataset: dataset.dataset, profiles }),
        });
        const body = await response.json() as AuditOutput & { error?: string };
        if (!response.ok) throw new Error(body.error || `Audit batch ${Math.floor(offset / BATCH_SIZE) + 1} zlyhal.`);
        accumulated.push(...body.items.map((item, index) => ({ ...item, index: offset + index })));
        setItems([...accumulated]);
        setProcessed(Math.min(offset + profiles.length, dataset.profiles.length));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audit zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, summary, items }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "address-research-audit-result.json";
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <section style={{ maxWidth: 1500, margin: "24px auto 64px", padding: "0 24px" }}>
      <div style={{ border: "2px solid #b9c8b9", borderRadius: 14, padding: 20 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>STRICT READ-ONLY · D1 READS ONLY</p>
        <h2>Audit proti aktuálnej databáze</h2>
        <p>Porovná complete structured research adresy s current canonical DIRECTORY stavom. Bez Apply, providerov, GEO a externého webu.</p>
        <input type="file" accept=".json,application/json" onChange={(event) => onFile(event.target.files?.[0] ?? null)} disabled={busy} />
        {fileName ? <p><strong>Súbor:</strong> {fileName}</p> : null}
        <button type="button" onClick={runAudit} disabled={!dataset || busy} style={{ padding: "10px 16px", fontWeight: 700 }}>
          {busy ? "Auditujem…" : "Spustiť read-only audit"}
        </button>
        {dataset?.profiles?.length ? <p><strong>Progress:</strong> {processed} / {dataset.profiles.length}</p> : null}
        {error ? <p role="alert" style={{ color: "#a40000", fontWeight: 700 }}>{error}</p> : null}

        {items.length ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "18px 0" }}>
              {COUNTERS.map((key) => <span key={key} style={{ border: "1px solid #ddd", borderRadius: 999, padding: "6px 9px", fontSize: 12 }}><strong>{key}</strong>: {summary[key] ?? 0}</span>)}
            </div>
            <button type="button" onClick={download} disabled={busy} style={{ padding: "9px 14px", fontWeight: 700, marginBottom: 14 }}>Stiahnuť audit JSON</button>
            <div style={{ overflow: "auto", maxHeight: "65vh", border: "1px solid #e5e5e5", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1800, fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
                  <tr>{["ID", "Názov", "Kategória", "Psipedia URL", "Action", "Confidence", "Current canonical", "Confirmation", "Current state/reason", "Research canonical", "Decision", "Difference", "updatedAt"].map((h) => <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.index}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.resolvedProfileId ?? item.profileId ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.name}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.category}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}><a href={item.psipediaUrl} target="_blank" rel="noreferrer">profil</a></td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.researchAction || "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.researchConfidence || "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{formatAddress(item.currentAddress)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.currentServiceAddressConfirmation ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.currentAddressState ?? "—"} / {item.currentAddressReason ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{formatAddress(item.researchedAddress)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>{item.decision}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.differenceReason || "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{item.updatedAt ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
