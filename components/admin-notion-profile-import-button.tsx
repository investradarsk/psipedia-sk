"use client";

import { useState } from "react";
import { AdminActionButton } from "@/components/admin-interaction-system";

type ProfileScope = "directory" | "events" | "breeds";

export function AdminNotionProfileImportButton({
  scope, profileId, disabled = false, dirty = false,
}: {
  scope: ProfileScope; profileId: number; disabled?: boolean; dirty?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function importFromNotion() {
    if (pending || disabled) return;
    if (!window.confirm(dirty
      ? "Neuložené zmeny v editore sa stratia. Nahradiť údaje tohto profilu aktuálnymi údajmi z Notionu?"
      : "Aktualizovať tento profil podľa aktuálnych údajov v Notione? Technické identifikátory a publikovanie zostanú zachované."))
      return;
    setPending(true);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/notion-profile-import", {
        method: "POST", headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ scope, id: profileId }),
      });
      const data = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Prenos z Notionu zlyhal.");
      if (data.status === "unchanged") {
        setFeedback("Údaje profilu už zodpovedajú Notionu.");
        return;
      }
      // Refresh the canonical server data; do not keep a stale editor form.
      window.location.reload();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Prenos z Notionu zlyhal.");
    } finally { setPending(false); }
  }
  return (
    <span>
      <AdminActionButton type="button" variant="secondary" disabled={pending || disabled}
        onClick={() => void importFromNotion()}>
        {pending ? "Aktualizujem z Notionu…" : "Aktualizovať z Notionu"}
      </AdminActionButton>
      {feedback && <small role="status" style={{ display: "block" }}>{feedback}</small>}
    </span>
  );
}
