"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin-profile-review-inline-approval.module.css";

/** Only the low-risk approval transition is exposed in the list.
 * Hide/reject/remove still require the full moderation form with reasons. */
export function AdminProfileReviewInlineApproval({
  reviewId, currentStatus,
}: { reviewId: string; currentStatus: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (currentStatus !== "PENDING_REVIEW") return null;

  async function approve() {
    if (saving || !editing) return;
    if (!window.confirm("Schváliť recenziu a zverejniť ju na profile?")) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/profile-reviews/" + encodeURIComponent(reviewId), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "APPROVE",
          expectedStatus: "PENDING_REVIEW",
          reasonCode: null,
          moderatorNote: null,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Schválenie sa nepodarilo uložiť.");
      setEditing(false);
      setMessage("Recenzia bola schválená.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Schválenie sa nepodarilo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.desktopOnly}>
      {editing ? (
        <div className={styles.controls}>
          <button type="button" className={styles.save} disabled={saving}
            onClick={() => void approve()}>{saving ? "Ukladám…" : "Schváliť"}</button>
          <button type="button" disabled={saving} onClick={() => { setEditing(false); setMessage(""); }}>Zrušiť</button>
        </div>
      ) : (
        <button type="button" disabled={saving} onClick={() => { setEditing(true); setMessage(""); }}>
          Upraviť stav
        </button>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
