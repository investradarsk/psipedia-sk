"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  profileReviewModerationReasonCodes,
  type ProfileReviewAdminAction,
} from "@/lib/profile-review-admin-transition";
import type { ProfileReviewStatus } from "@/lib/profile-review-domain";

const actionLabels: Record<ProfileReviewAdminAction, string> = {
  APPROVE: "Schváliť",
  REJECT: "Zamietnuť",
  HIDE: "Skryť",
  RESTORE: "Obnoviť",
  REMOVE: "Odstrániť",
};

const reasonLabels: Record<(typeof profileReviewModerationReasonCodes)[number], string> = {
  SPAM: "Spam",
  ABUSE: "Nevhodný / útočný obsah",
  PRIVACY: "Súkromie / osobné údaje",
  OFF_TOPIC: "Mimo témy",
  CONFLICT_OF_INTEREST: "Konflikt záujmov",
  MISLEADING: "Zavádzajúci obsah",
  DUPLICATE: "Duplicitný obsah",
  OTHER: "Iný dôvod",
};

function allowedActions(status: ProfileReviewStatus): ProfileReviewAdminAction[] {
  if (status === "PENDING_REVIEW") return ["APPROVE", "REJECT", "REMOVE"];
  if (status === "VISIBLE") return ["HIDE", "REMOVE"];
  if (status === "HIDDEN") return ["RESTORE", "REJECT", "REMOVE"];
  return [];
}

function requiresReason(action: ProfileReviewAdminAction) {
  return action === "REJECT" || action === "HIDE" || action === "REMOVE";
}

function confirmation(action: ProfileReviewAdminAction) {
  if (action === "APPROVE") return "Schváliť recenziu a zverejniť ju na profile?";
  if (action === "RESTORE") return "Obnoviť recenziu a znovu ju zverejniť?";
  if (action === "HIDE") return "Dočasne skryť túto verejnú recenziu?";
  if (action === "REJECT") return "Zamietnuť túto recenziu?";
  return "Odstrániť túto recenziu podľa moderation lifecycle?";
}

export function AdminProfileReviewActions({
  reviewId,
  currentStatus,
}: {
  reviewId: string;
  currentStatus: ProfileReviewStatus;
}) {
  const router = useRouter();
  const actions = useMemo(() => allowedActions(currentStatus), [currentStatus]);
  const [reasonCode, setReasonCode] = useState("");
  const [moderatorNote, setModeratorNote] = useState("");
  const [busy, setBusy] = useState<ProfileReviewAdminAction | null>(null);
  const [message, setMessage] = useState("");

  async function run(action: ProfileReviewAdminAction) {
    if (busy) return;
    if (requiresReason(action) && !reasonCode) {
      setMessage("Vyber dôvod moderácie.");
      return;
    }
    if (!window.confirm(confirmation(action))) return;

    setBusy(action);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/profile-reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          expectedStatus: currentStatus,
          reasonCode: requiresReason(action) ? reasonCode : null,
          moderatorNote: moderatorNote.trim() || null,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Moderáciu sa nepodarilo uložiť.");
      setMessage(`${actionLabels[action]}: uložené.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Moderáciu sa nepodarilo uložiť.");
    } finally {
      setBusy(null);
    }
  }

  if (!actions.length) {
    return (
      <section className="admin-form-card">
        <h2>Moderácia</h2>
        <p>Pre stav <strong>{currentStatus}</strong> nie je v REVIEWS-3 dostupná ďalšia admin akcia.</p>
      </section>
    );
  }

  const hasNegativeAction = actions.some(requiresReason);

  return (
    <section className="admin-form-card" aria-labelledby="review-moderation-heading">
      <h2 id="review-moderation-heading">Moderácia</h2>
      <p className="admin-review-hint">
        Moderácia mení iba visibility/lifecycle. Text recenzie ani rating sa tým neupravujú.
      </p>

      {hasNegativeAction ? (
        <div className="admin-review-form-grid">
          <label>
            Dôvod pre zamietnutie, skrytie alebo odstránenie
            <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
              <option value="">Vyber dôvod</option>
              {profileReviewModerationReasonCodes.map((code) => (
                <option key={code} value={code}>{reasonLabels[code]}</option>
              ))}
            </select>
          </label>
          <label>
            Interná poznámka moderátora (voliteľná)
            <textarea
              rows={4}
              maxLength={1000}
              value={moderatorNote}
              onChange={(event) => setModeratorNote(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      <div className="admin-review-actions">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className={action === "REJECT" || action === "REMOVE" ? "is-danger" : undefined}
            disabled={busy !== null}
            onClick={() => run(action)}
          >
            {busy === action ? "Ukladám…" : actionLabels[action]}
          </button>
        ))}
      </div>
      {message ? <p className="admin-review-message" role="status">{message}</p> : null}
    </section>
  );
}
