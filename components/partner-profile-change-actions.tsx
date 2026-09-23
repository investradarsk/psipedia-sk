"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PartnerProfileChangeWithdrawButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState("");

  async function withdraw() {
    if (!window.confirm("Naozaj chcete tento návrh úprav zrušiť?")) return;
    setState("sending");
    setMessage("");
    try {
      const response = await fetch(`/api/partner/profile-changes/${encodeURIComponent(id)}/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Návrh sa nepodarilo zrušiť.");
      router.refresh();
      setState("idle");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Návrh sa nepodarilo zrušiť.");
    }
  }

  return (
    <div className="partner-request-action">
      <button type="button" onClick={withdraw} disabled={state === "sending"}>
        {state === "sending" ? "Ruším…" : "Zrušiť návrh"}
      </button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}
