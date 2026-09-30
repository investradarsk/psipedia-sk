"use client";

import { useState } from "react";
import type { AdminReviewEntityType } from "@/lib/admin-entity-review-store";
import styles from "./admin-review-checkbox.module.css";

type Props = {
  entityType: AdminReviewEntityType;
  entityId: number;
  initialReviewed: boolean;
  initialReviewedAt?: string;
  compact?: boolean;
  showDate?: boolean;
};

function formatReviewedAt(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

export function AdminReviewCheckbox({
  entityType,
  entityId,
  initialReviewed,
  initialReviewedAt = "",
  compact = false,
  showDate = false,
}: Props) {
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [reviewedAt, setReviewedAt] = useState(initialReviewedAt);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function change(nextReviewed: boolean) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType, entityId, reviewed: nextReviewed }),
      });
      const payload = await response.json() as {
        error?: string;
        review?: { reviewed: boolean; reviewedAt: string };
      };
      if (!response.ok || !payload.review) throw new Error(payload.error || "Stav kontroly sa nepodarilo uložiť.");
      setReviewed(payload.review.reviewed);
      setReviewedAt(payload.review.reviewedAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stav kontroly sa nepodarilo uložiť.");
    } finally {
      setPending(false);
    }
  }

  return <span>
    <label className={[
      styles.control,
      compact ? styles.compact : "",
      pending ? styles.pending : "",
    ].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        checked={reviewed}
        disabled={pending}
        onChange={(event) => void change(event.target.checked)}
        aria-label={reviewed ? "Označené ako odkontrolované" : "Označiť ako odkontrolované"}
      />
      <span>{reviewed ? "Odkontrolované ✓" : "Odkontrolované"}</span>
      {showDate && reviewed && reviewedAt ? <small>{formatReviewedAt(reviewedAt)}</small> : null}
    </label>
    {error ? <span className={styles.error} role="alert">{error}</span> : null}
  </span>;
}
