"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationFindingDetail } from "@/lib/data-automation-store";
import type { AutomationReviewAction } from "@/lib/data-automation";
import styles from "./admin-operations-ux.module.css";

const reviewableStatuses = new Set(["NEW", "IN_REVIEW", "SUPPRESSED", "APPROVED"]);
const applyFindingTypes = new Set(["NEW_ENTITY", "POSSIBLE_UPDATE", "POSSIBLE_CANCELLED"]);

type FindingAction = AutomationReviewAction | "approve-apply";

export function AdminAutomationFindingReview({ finding }: { finding: AutomationFindingDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(finding.reviewerNotes ?? "");
  const [message, setMessage] = useState("");

  const canApply = applyFindingTypes.has(finding.findingType);
  const isNewEntity = finding.findingType === "NEW_ENTITY";

  async function review(action: FindingAction, suppressedDays?: number) {
    if (action === "approve-apply") {
      const warning = isNewEntity
        ? "Schváliť finding a vytvoriť canonical koncept? Nový záznam zostane DRAFT a nebude automaticky publikovaný."
        : "Schváliť a aplikovať navrhované polia do canonical záznamu? Publication stav sa nezmení. Ak je záznam už publikovaný, schválené údaje sa po aplikovaní prejavia aj verejne.";
      if (!window.confirm(warning)) return;
    }
    if (action === "approve" && !window.confirm(
      "Schváliť iba finding bez aplikovania? Canonical záznam sa týmto krokom nezmení.",
    )) return;
    if (action === "reject" && !window.confirm("Zamietnuť tento finding? Rovnaký nezmenený payload sa nebude znovu otvárať.")) return;

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
        reclassified?: "EXISTING_ORGANIZATION";
        error?: string;
      };
      if (!response.ok || !payload.finding) throw new Error(payload.error || "Finding sa nepodarilo spracovať.");
      if (payload.reclassified === "EXISTING_ORGANIZATION") {
        setMessage("Organizácia už existuje. Nález som prepojil s existujúcim profilom. Skontroluj zmeny a potom použi „Schváliť a aplikovať“.");
        router.refresh();
        return;
      }
      if (action === "approve-apply" && !payload.application) {
        throw new Error("Aplikovanie sa nepotvrdilo. Obnov stránku a skús to znova.");
      }
      setMessage(
        action === "approve-apply"
          ? payload.application?.applicationType === "CREATE_DRAFT"
            ? "Schválené. Vytvoril sa koncept; nič sa automaticky nezverejnilo."
            : "Schválené. Navrhované údaje boli zapísané do záznamu."
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
            {isNewEntity ? "Schváliť a vytvoriť koncept" : "Schváliť a aplikovať"}
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
                <button type="button" disabled={busy} onClick={() => void review("approve")}>Schváliť iba finding</button>
              </>
            )}
          </div>
          {!canApply && finding.findingType === "POSSIBLE_INACTIVE" && (
            <p>Možná neaktivita sa musí potvrdiť priamo v canonical profile. Automatické odpublikovanie alebo archivácia nie sú súčasťou bezpečného apply.</p>
          )}
        </div>
      </details>
    </section>
  );
}
