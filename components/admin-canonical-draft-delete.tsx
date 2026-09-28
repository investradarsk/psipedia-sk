"use client";

import { useState } from "react";
import {
  AdminActionButton,
  AdminDestructiveConfirmDialog,
} from "@/components/admin-interaction-system";
import type { CanonicalDraftDeleteEntityType } from "@/lib/canonical-draft-delete";

export function AdminCanonicalDraftDelete({
  entityType,
  canonicalEntityId,
  returnHref,
}: {
  entityType: CanonicalDraftDeleteEntityType;
  canonicalEntityId: number;
  returnHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/canonical-drafts/${encodeURIComponent(entityType)}/${canonicalEntityId}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Koncept sa nepodarilo úplne vymazať.");
      setOpen(false);
      window.alert("Koncept bol úplne vymazaný.");
      window.location.assign(returnHref);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Koncept sa nepodarilo úplne vymazať.");
      setPending(false);
    }
  }

  return (
    <section className="admin-form-card" data-canonical-draft-delete>
      <h2>Odstránenie konceptu</h2>
      <p>Permanentne odstráni iba tento rozpracovaný canonical koncept. Publikované záznamy týmto spôsobom vymazať nemožno.</p>
      {error && <p className="admin-flash admin-flash--error" role="alert">{error}</p>}
      <AdminActionButton variant="destructive" onClick={() => { setError(""); setOpen(true); }}>
        Vymazať koncept
      </AdminActionButton>
      <AdminDestructiveConfirmDialog
        open={open}
        title="Naozaj chcete tento koncept úplne vymazať?"
        description="Táto akcia sa nedá vrátiť."
        affectedCount={1}
        affectedLabel="koncept"
        confirmLabel="Vymazať koncept"
        pending={pending}
        onCancel={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
