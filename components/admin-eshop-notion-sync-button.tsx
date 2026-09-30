"use client";

import { useState } from "react";

type Summary = {
  bootstrapped: number;
  createdFromNotion: number;
  pulledFromNotion: number;
  pushedToNotion: number;
  failed: number;
};

export function AdminEshopNotionSyncButton() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    if (running) return;
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/notion-eshops-sync", { method: "POST" });
      const data = await response.json() as { summary?: Summary; error?: string };
      if (!response.ok || !data.summary) throw new Error(data.error || "Synchronizácia zlyhala.");
      const summary = data.summary;
      setMessage(
        "Notion: " +
        summary.bootstrapped + " nových prepojení, " +
        summary.createdFromNotion + " vytvorených, " +
        summary.pulledFromNotion + " načítaných, " +
        summary.pushedToNotion + " odoslaných" +
        (summary.failed ? ", " + summary.failed + " chýb" : "") + ".",
      );
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Synchronizácia zlyhala.");
      setRunning(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button className="admin-primary-action" type="button" onClick={sync} disabled={running}>
        {running ? "Synchronizujem…" : "Synchronizovať Notion"}
      </button>
      {message ? <small role="status">{message}</small> : null}
    </span>
  );
}
