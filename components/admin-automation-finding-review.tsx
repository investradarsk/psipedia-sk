"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationFindingDetail } from "@/lib/data-automation-store";
import type { AutomationReviewAction } from "@/lib/data-automation";

const activeStatuses = new Set(["NEW", "IN_REVIEW", "SUPPRESSED"]);

export function AdminAutomationFindingReview({ finding }: { finding: AutomationFindingDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(finding.reviewerNotes ?? "");
  const [message, setMessage] = useState("");

  async function review(action: AutomationReviewAction, suppressedDays?: number) {
    if (action === "approve" && !window.confirm(
      "Schváliť finding? Týmto sa canonical záznam NEPREPÍŠE ani NEPUBLIKUJE. Schválenie iba zaznamená reviewer decision pre ďalší existujúci workflow.",
    )) return;
    if (action === "reject" && !window.confirm("Zamietnuť tento finding? Rovnaký nezmenený payload sa nebude znovu otvárať.")) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/automation-findings/${finding.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, notes, suppressedDays }),
      });
      const payload = await response.json() as { finding?: AutomationFindingDetail; error?: string };
      if (!response.ok || !payload.finding) throw new Error(payload.error || "Finding sa nepodarilo spracovať.");
      setMessage(
        action === "approve"
          ? "Finding je schválený. Canonical záznam ani publikácia sa automaticky nezmenili."
          : "Reviewer decision bol uložený.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Finding sa nepodarilo spracovať.");
    } finally {
      setBusy(false);
    }
  }

  if (!activeStatuses.has(finding.reviewStatus)) {
    return (
      <section className="admin-panel">
        <h2>Reviewer decision</h2>
        <p><strong>{finding.reviewStatus}</strong>{finding.reviewedBy ? ` · ${finding.reviewedBy}` : ""}</p>
        {finding.reviewerNotes && <p>{finding.reviewerNotes}</p>}
        <p>Canonical záznam sa týmto rozhodnutím automaticky nemení ani nepublikuje.</p>
      </section>
    );
  }

  return (
    <section className="admin-panel">
      <h2>Review findingu</h2>
      <p>Rozhodnutie sa zapisuje iba k findingu. Canonical write a publication zostávajú oddelené.</p>
      <label className="admin-field">
        <span>Poznámka reviewera</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={2000} />
      </label>
      {message && <p className="admin-flash" role="status">{message}</p>}
      <div className="admin-form-actions">
        {finding.reviewStatus !== "IN_REVIEW" && <button type="button" disabled={busy} onClick={() => void review("start-review")}>Začať review</button>}
        <button type="button" disabled={busy} onClick={() => void review("ignore")}>Ignorovať</button>
        <button type="button" disabled={busy} onClick={() => void review("suppress", 30)}>Potlačiť na 30 dní</button>
        <button className="is-danger" type="button" disabled={busy} onClick={() => void review("reject")}>Zamietnuť</button>
        <button className="is-primary" type="button" disabled={busy} onClick={() => void review("approve")}>Schváliť finding</button>
      </div>
    </section>
  );
}
