"use client";

import { useState } from "react";

type Props = {
  className?: string;
  accessibleName?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function PartnerLogoutButton({
  className = "partner-shell-logout",
  accessibleName = "Odhlásiť sa z Partner účtu",
  disabled = false,
  onBusyChange,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const response = await fetch("/api/partner/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Odhlásenie sa nepodarilo.");
      window.location.replace("/partner/prihlasenie");
    } catch {
      setError("Odhlásenie sa nepodarilo. Skúste to znova.");
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <span className="partner-logout-control">
      <button
        className={className}
        type="button"
        aria-label={accessibleName}
        onClick={logout}
        disabled={busy || disabled}
      >
        {busy ? "Odhlasujem…" : "Odhlásiť sa"}
      </button>
      {error ? <span className="partner-logout-error" role="alert">{error}</span> : null}
    </span>
  );
}
