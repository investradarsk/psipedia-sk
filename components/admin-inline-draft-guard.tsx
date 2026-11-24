"use client";

import { useEffect } from "react";
import { useAdminEditorNavigationGuard } from "@/components/admin-editor-navigation-guard";
import { EditorUnsavedChangesGuard } from "@/components/admin-editor-workspace";
import { AdminActionButton } from "@/components/admin-interaction-system";

/** Reuse the editor navigation gate. Native GET forms are blocked while a draft
 * exists; the operator can save/cancel first rather than silently lose edits. */
export function AdminInlineDraftGuard({ active, stale, busy, onCancel }: {
  active: boolean;
  stale: boolean;
  busy: boolean;
  onCancel: () => void;
}) {
  const navigation = useAdminEditorNavigationGuard({ dirty: active });
  useEffect(() => {
    if (!active) return;
    const blockFilterSubmit = (event: Event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.method.toLowerCase() === "get") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("submit", blockFilterSubmit, true);
    return () => document.removeEventListener("submit", blockFilterSubmit, true);
  }, [active]);

  return <>
    {active && <div className="admin-flash" role={stale ? "alert" : "status"} data-admin-inline-draft>
      {busy ? "Ukladám zmeny. Počkajte na výsledok." : stale
        ? "Záznam alebo zobrazenie sa medzitým zmenili. Rozpracovaná úprava sa neodošle so starou verziou."
        : "Rozpracovaná úprava. Pred filtrovaním, triedením alebo ďalšou úpravou ju uložte alebo zrušte."}
      <AdminActionButton variant="neutral" disabled={busy} onClick={onCancel}>Zrušiť rozpracovanú úpravu</AdminActionButton>
    </div>}
    <EditorUnsavedChangesGuard active={active} open={navigation.confirmOpen}
      allowNativeExitRef={navigation.allowNativeExitRef} onStay={navigation.stay}
      onDiscard={() => {
        if (busy) { navigation.stay(); return; }
        onCancel();
        navigation.discard();
      }} />
  </>;
}
