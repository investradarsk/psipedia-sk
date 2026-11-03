"use client";

import { useEffect } from "react";

/**
 * A route render failure must not leave an empty white admin workspace,
 * especially in iOS standalone / PWA mode. The links are ordinary document
 * navigations and do not reuse a potentially invalid client router tree.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No user, cookie, article or provider data in the error report.
    console.error("admin_route_render_failed", error.digest ?? error.name);
  }, [error]);

  return (
    <main id="obsah" className="admin-root" data-admin-recovery="true">
      <div className="admin-shell shell">
        <section className="admin-panel" role="alert" aria-labelledby="admin-recovery-title">
          <h1 id="admin-recovery-title">Administrácia sa nenačítala</h1>
          <p>Skús stránku obnoviť. Neuložené zmeny v editore sa môžu stratiť.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <button type="button" onClick={() => window.location.reload()}>
              Obnoviť stránku
            </button>
            <button type="button" onClick={reset}>Skúsiť znova</button>
            <a href="/admin">Pracovný prehľad</a>
            <a href="/admin/clanky">Články</a>
          </div>
        </section>
      </div>
    </main>
  );
}
