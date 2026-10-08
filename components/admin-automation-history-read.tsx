"use client";

import { useState } from "react";

export function AdminAutomationHistoryRead({ eventId }: { eventId: number }) {
  const [busy, setBusy] = useState(false);
  async function markRead() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/push/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!response.ok) throw new Error("Zmenu sa nepodarilo uložiť.");
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }
  return <button type="button" disabled={busy} onClick={markRead}>Označiť prečítané</button>;
}
