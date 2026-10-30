"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HelpSourceEntityType } from "@/lib/help-source-daily-check";
import styles from "./admin-help-source-quick-actions.module.css";

export function AdminHelpSourceQuickActions({
  entityType, entityId, checkedAt,
}: {
  entityType: HelpSourceEntityType;
  entityId: number;
  checkedAt: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"CONFIRM_ACTIVE" | "MARK_ENDED" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const endingLabel = entityType === "ADOPTION" ? "Adoptované" : "Pátranie ukončené";
  async function decide(action: "CONFIRM_ACTIVE" | "MARK_ENDED") {
    if (!checkedAt || pending) return;
    if (action === "MARK_ENDED" && !window.confirm(
      entityType === "ADOPTION"
        ? "Overil si zdroj? Naozaj označiť psa ako adoptovaného a ukončiť jeho ponuku?"
        : "Overil si zdroj? Naozaj označiť pátranie ako vyriešené?",
    )) return;

    setPending(action);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/help-source-checks/" + entityType + "/" + entityId, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, expectedCheckedAt: checkedAt }), cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Zmenu sa nepodarilo uložiť.");
      }
      setSuccess(action === "MARK_ENDED"
        ? "Stav profilu bol aktualizovaný."
        : "Aktuálnosť bola potvrdená.");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Zmenu sa nepodarilo uložiť.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.buttons}>
        <button type="button" disabled={!checkedAt || Boolean(pending)}
          onClick={() => void decide("CONFIRM_ACTIVE")}>
          {pending === "CONFIRM_ACTIVE" ? "Ukladám…" : "Stále aktívne"}
        </button>
        <button type="button" className={styles.ended} disabled={!checkedAt || Boolean(pending)}
          onClick={() => void decide("MARK_ENDED")}>
          {pending === "MARK_ENDED" ? "Ukladám…" : endingLabel}
        </button>
      </div>
      {!checkedAt && <p className={styles.hint}>Zdroj ešte nebol automaticky skontrolovaný.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {success && <p role="status" className={styles.success}>{success}</p>}
    </div>
  );
}
