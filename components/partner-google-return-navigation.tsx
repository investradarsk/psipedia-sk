"use client";

import { useEffect } from "react";

export function PartnerGoogleReturnNavigation({ target }: { target: string }) {
  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <p className="partner-auth-help">
      Ak sa presmerovanie nespustí automaticky, <a href={target}>pokračujte manuálne</a>.
    </p>
  );
}
