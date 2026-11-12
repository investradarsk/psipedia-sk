"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** A normal refresh may re-render the server tree and its client editors.
 * Never start it automatically or while a dirty editor is still mounted.
 */
export function AdminOptionalReadError({
  message,
}: {
  message: string;
}) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const retry = () => {
    if (document.documentElement.hasAttribute("data-admin-unsaved-editor")) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    startTransition(() => router.refresh());
  };
  return <div className="admin-panel" role="alert" data-admin-optional-read-failed>
    <p>{message}</p>
    <button type="button" disabled={pending} onClick={retry}>
      {pending ? "Načítavam…" : "Skúsiť načítať znova"}
    </button>
    {blocked && <p role="status">
      Najprv ulož rozpracované údaje. Obnova môže znova načítať celý editor.
    </p>}
  </div>;
}

/** One deliberate recovery UI for both the Admin and organization detail
 * error boundaries. Never expose raw server errors or auto-reload on iOS.
 */
export function AdminErrorRecovery({
  error,
  reset,
  title = "Administrácia sa nenačítala",
  backHref = "/admin",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  backHref?: string;
}) {
  const [confirmation, setConfirmation] = useState<"reset" | "reload" | null>(null);
  const [attempting, setAttempting] = useState(false);

  const run = (action: "reset" | "reload") => {
    setAttempting(true);
    if (action === "reload") window.location.reload();
    else reset();
  };
  const request = (action: "reset" | "reload") => {
    if (document.documentElement.hasAttribute("data-admin-unsaved-editor")) {
      setConfirmation(action);
      return;
    }
    run(action);
  };

  // The error digest is logged to the browser console by the parent error
  // boundary, not displayed alongside authenticated editor content.
  void error;

  return <main id="obsah" className="admin-root" data-admin-recovery="true">
    <div className="admin-shell shell">
      <section className="admin-panel" role="alert" aria-labelledby="admin-recovery-title">
        <h1 id="admin-recovery-title">{title}</h1>
        <p>Načítanie zlyhalo. Žiadne údaje sme neuložili ani automaticky nevymazali.</p>
        <p>Ak si mal rozpracovaný formulár, obnova stránky môže neuložené zmeny stratiť.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          <button type="button" disabled={attempting} onClick={() => request("reset")}>
            Skúsiť znova
          </button>
          <button type="button" disabled={attempting} onClick={() => request("reload")}>
            Obnoviť stránku
          </button>
          <Link href={backHref} target="_blank" rel="noopener noreferrer" prefetch={false}>
            Otvoriť zoznam v novej karte
          </Link>
          <Link href="/admin" target="_blank" rel="noopener noreferrer" prefetch={false}>
            Pracovný prehľad v novej karte
          </Link>
        </div>
        {confirmation && <div role="group" aria-label="Potvrdenie straty neuložených zmien">
          <p role="alert">Rozpracovaný formulár obsahuje neuložené zmeny. Pokračovaním ich môžeš stratiť.</p>
          <button type="button" onClick={() => setConfirmation(null)}>Pokračovať v úpravách</button>
          <button type="button" onClick={() => run(confirmation)}>Zahodiť zmeny a pokračovať</button>
        </div>}
      </section>
    </div>
  </main>;
}
