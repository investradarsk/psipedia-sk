"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminActionButton, AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
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
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingReview, setPendingReview] = useState<{ action: FindingAction; description: string } | null>(null);

  const canApply = applyFindingTypes.has(finding.findingType);

  function requestReview(action: FindingAction) {
    if (busy) return;
    const description = action === "approve-apply"
      ? finding.findingType === "DUPLICATE_CANDIDATE"
        ? "Vytvoriť samostatný koncept označený ako možná duplicita? Existujúci canonical záznam zostane nezmenený."
        : "Vytvoriť koncept z tohto návrhu? Koncept zostane rozpracovaný a nebude automaticky publikovaný."
      : action === "approve" ? "Označiť návrh ako schválený bez zmeny záznamu?"
      : "Zamietnuť tento návrh? Rovnaká nezmenená verzia sa nebude znovu otvárať.";
    setPendingReview({ action, description });
  }

  async function review(action: FindingAction, suppressedDays?: number) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setErrorMessage("");
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
      setPendingReview(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Položku sa nepodarilo spracovať.");
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

      <AdminFormFeedback message={message} error={errorMessage} className="admin-flash" />

      <div className="admin-form-actions">
        {canApply && (
          <AdminActionButton variant="primary" disabled={busy} onClick={() => requestReview("approve-apply")}>
            {finding.findingType === "DUPLICATE_CANDIDATE" ? "Vytvoriť koncept s varovaním" : "Vytvoriť koncept"}
          </AdminActionButton>
        )}
        {finding.reviewStatus !== "APPROVED" && (
          <AdminActionButton variant="destructive" disabled={busy} onClick={() => requestReview("reject")}>Zamietnuť</AdminActionButton>
        )}
        {finding.reviewStatus !== "APPROVED" && (
          <AdminActionButton disabled={busy} onClick={() => void review("suppress", 30)}>Odložiť na 30 dní</AdminActionButton>
        )}
      </div>

      <details className={styles.advanced}>
        <summary>Ďalšie možnosti</summary>
        <div className={styles.advancedBody}>
          <div className="admin-form-actions">
            {finding.reviewStatus !== "APPROVED" && finding.reviewStatus !== "IN_REVIEW" && (
              <AdminActionButton disabled={busy} onClick={() => void review("start-review")}>Označiť ako rozpracované</AdminActionButton>
            )}
            {finding.reviewStatus !== "APPROVED" && (
              <>
                <AdminActionButton disabled={busy} onClick={() => void review("ignore")}>Ignorovať</AdminActionButton>
                <AdminActionButton disabled={busy} onClick={() => requestReview("approve")}>Schváliť bez zmeny záznamu</AdminActionButton>
              </>
            )}
          </div>
          {!canApply && finding.findingType === "POSSIBLE_INACTIVE" && (
            <p>Možná neaktivita sa musí potvrdiť priamo v profile. Automatické odpublikovanie ani archivácia nie sú súčasťou bezpečného prijatia zmeny.</p>
          )}
        </div>
      </details>
      <AdminDestructiveConfirmDialog
        open={pendingReview!==null} title="Potvrdiť rozhodnutie"
        description={pendingReview?.description} affectedCount={pendingReview?1:0}
        affectedLabel="návrh" confirmLabel={pendingReview?.action==="reject"?"Zamietnuť":"Potvrdiť"}
        confirmVariant={pendingReview?.action==="reject"?"destructive":"primary"} pending={busy}
        onCancel={()=>{if(!busy)setPendingReview(null);}}
        onConfirm={()=>{if(pendingReview)void review(pendingReview.action);}}
      />
    </section>
  );
}
