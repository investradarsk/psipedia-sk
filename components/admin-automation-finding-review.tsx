"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationFindingDetail } from "@/lib/data-automation-store";
import type { AutomationReviewAction } from "@/lib/data-automation";
import styles from "./admin-operations-ux.module.css";

const reviewableStatuses = new Set(["NEW", "IN_REVIEW", "SUPPRESSED", "APPROVED"]);
const applyFindingTypes = new Set(["NEW_ENTITY", "DUPLICATE_CANDIDATE"]);

type FindingAction = AutomationReviewAction | "approve-apply";

export function AdminAutomationFindingReview({ finding }: { finding: AutomationFindingDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(finding.reviewerNotes ?? "");
  const [message, setMessage] = useState("");

  const canApply = applyFindingTypes.has(finding.findingType);
  const createsDraft = finding.findingType === "NEW_ENTITY" || finding.findingType === "DUPLICATE_CANDIDATE";

  async function review(action: FindingAction, suppressedDays?: number) {
    if (action === "approve-apply") {
      const warning = finding.findingType === "DUPLICATE_CANDIDATE"
        ? "Vytvoriť samostatný koncept označený ako možná duplicita? Existujúci canonical záznam zostane nezmenený."
        : "Vytvoriť koncept z tohto návrhu? Koncept zostane rozpracovaný a nebude automaticky publikovaný.";
      if (!window.confirm(warning)) return;
    }
    if (action === "approve" && !window.confirm(
      "Označiť návrh ako schválený bez zmeny záznamu?",
    )) return;
    if (action === "reject" && !window.confirm("Zamietnuť tento návrh? Rovnaká nezmenená verzia sa nebude znovu otvárať.")) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation-findings/" + finding.id, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, notes, suppressedDays }),
      });
      const payload = await response.json() as {
        finding?: AutomationFindingDetail;
        application?: { canonicalEntityId: number; applicationType: string; appliedFields: string[] } | null;
        error?: string;
      };
      if (!response.ok || !payload.finding) throw new Error(payload.error || "Finding sa nepodarilo spracovať.");
      setMessage(
        action === "approve-apply"
          ? payload.application?.applicationType === "CREATE_DRAFT"
            ? "Schválené. Vytvoril sa samostatný koncept; nič sa automaticky nezverejnilo."
            : "Spracované ako existujúci záznam. Canonical obsah zostal nezmenený."
          : action === "approve"
            ? "Položka je označená ako schválená bez zmeny záznamu."
            : "Rozhodnutie bolo uložené.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Položku sa nepodarilo spracovať.");
    } finally {
      setBusy(false);
    }
  }

  if (!reviewableStatuses.has(finding.reviewStatus)) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Rozhodnutie</h2></div></div>
        <p><strong>{finding.reviewStatus}</strong>{finding.reviewedBy ? " · " + finding.reviewedBy : ""}</p>
        {finding.reviewerDecision === "APPROVE_APPLY" && <p><strong>Zmena bola aplikovaná do záznamu.</strong></p>}
        {finding.reviewerNotes && <p>{finding.reviewerNotes}</p>}
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Rozhodnutie</h2>
          <p>Automatizácia sama nič nemení. Nový záznam sa vždy vytvorí ako koncept.</p>
        </div>
      </div>

      <label className="admin-field">
        <span>Interná poznámka</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Voliteľné…" />
      </label>

      {message && <p className="admin-flash" role="status">{message}</p>}

      <div className="admin-form-actions">
        {canApply && (
          <button className="is-primary" type="button" disabled={busy} onClick={() => void review("approve-apply")}>
            {finding.findingType === "DUPLICATE_CANDIDATE" ? "Vytvoriť koncept s varovaním" : "Vytvoriť koncept"}
          </button>
        )}
        {finding.reviewStatus !== "APPROVED" && (
          <button className="is-danger" type="button" disabled={busy} onClick={() => void review("reject")}>Zamietnuť</button>
        )}
        {finding.reviewStatus !== "APPROVED" && (
          <button type="button" disabled={busy} onClick={() => void review("suppress", 30)}>Odložiť na 30 dní</button>
        )}
      </div>

      <details className={styles.advanced}>
        <summary>Ďalšie možnosti</summary>
        <div className={styles.advancedBody}>
          <div className="admin-form-actions">
            {finding.reviewStatus !== "APPROVED" && finding.reviewStatus !== "IN_REVIEW" && (
              <button type="button" disabled={busy} onClick={() => void review("start-review")}>Označiť ako rozpracované</button>
            )}
            {finding.reviewStatus !== "APPROVED" && (
              <>
                <button type="button" disabled={busy} onClick={() => void review("ignore")}>Ignorovať</button>
                <button type="button" disabled={busy} onClick={() => void review("approve")}>Schváliť bez zmeny záznamu</button>
              </>
            )}
          </div>
          {!canApply && finding.findingType === "POSSIBLE_INACTIVE" && (
            <p>Možná neaktivita sa musí potvrdiť priamo v profile. Automatické odpublikovanie ani archivácia nie sú súčasťou bezpečného prijatia zmeny.</p>
          )}
        </div>
      </details>
    </section>
  );
}
