"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminAttentionItem } from "@/lib/admin-attention-queue";
import styles from "./admin-attention-actions.module.css";

type ActionItem = Pick<AdminAttentionItem, "sourceType" | "sourceId" | "relevantAt" | "readAt" | "snoozedUntil">;

export function AdminAttentionActions({ item }: { item: ActionItem }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [readAt, setReadAt] = useState(item.readAt);
  const [snoozedUntil, setSnoozedUntil] = useState(item.snoozedUntil);
  const deferred = Boolean(snoozedUntil && Date.parse(snoozedUntil) > Date.now());
  async function save(action: "READ" | "SNOOZE_7D" | "UNREAD") {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/attention/ack", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceType: item.sourceType, sourceId: item.sourceId, relevantAt: item.relevantAt, action }),
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Uloženie sa nepodarilo.");
      }
      setReadAt(action === "READ" ? new Date().toISOString() : null);
      setSnoozedUntil(action === "SNOOZE_7D" ? new Date(Date.now() + 7 * 86_400_000).toISOString() : null);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Uloženie sa nepodarilo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.actions}>
        <button type="button" disabled={pending} onClick={() => void save(readAt || deferred ? "UNREAD" : "READ")}>
          {readAt || deferred ? "Označiť ako neprečítané" : "Prečítané"}
        </button>
        <button type="button" disabled={pending || deferred} onClick={() => void save("SNOOZE_7D")}>
          {deferred ? "Odložené na 7 dní" : "Odložiť na 7 dní"}
        </button>
      </div>
      {error && <span className={styles.error} role="alert">{error}</span>}
    </div>
  );
}
