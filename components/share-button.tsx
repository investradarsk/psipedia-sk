"use client";

import { useState } from "react";

export function ShareButton({ title, label = "Zdieľať článok" }: { title: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title, url: window.location.href });
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <button type="button" className="share-button" onClick={share}>{copied ? "Odkaz skopírovaný" : label}</button>;
}
