"use client";

import { useState } from "react";
import { AdminActionButton, AdminModalDialog } from "@/components/admin-interaction-system";
import type { RecordKind } from "@/lib/admin-record-lifecycle";
import {
  ADMIN_BULK_DELETE_LIMIT, validatedAdminBulkIds,
  validatedAdminBulkPreview, runSequentialAdminRemovals,
  type AdminBulkDeletionPreview,
} from "@/lib/admin-record-bulk-delete";

type LifecycleResult = {
  state?: string;
  error?: string;
};
type Phase = "idle" | "preparing" | "ready" | "deleting" | "result";

function endpoint(kind: RecordKind, id: number) {
  return "/api/admin/record-lifecycle/" + kind + "/" + id;
}

export function AdminRecordBulkDelete({
  kind, selectedIds, disabled = false, onFinished,
}: {
  kind: RecordKind;
  selectedIds: readonly number[];
  disabled?: boolean;
  /** Called only with IDs whose lifecycle endpoint acknowledged complete or pending removal. */
  onFinished: (acknowledgedIds: number[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [previews, setPreviews] = useState<AdminBulkDeletionPreview[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [failureId, setFailureId] = useState<number | null>(null);
  const [finishedIds, setFinishedIds] = useState<number[]>([]);
  const working = phase === "preparing" || phase === "deleting";
  const canStart = !disabled && phase === "idle" && selectedIds.length > 0;

  async function prepare() {
    if (!canStart) return;
    let ids: number[];
    try {
      ids = validatedAdminBulkIds(selectedIds);
    } catch {
      setError("Vyber 1 až " + ADMIN_BULK_DELETE_LIMIT + " jedinečných platných ID.");
      return;
    }
    setPhase("preparing");
    setError("");
    setPreviews([]);
    setFailureId(null);
    setDone(0);
    setPendingCount(0);
    setFinishedIds([]);
    const verified: AdminBulkDeletionPreview[] = [];
    try {
      // Preflight never performs a mutation. Freeze exact IDs before opening the dialog.
      for (const id of ids) {
        const response = await fetch(endpoint(kind, id), {
          credentials: "same-origin", cache: "no-store",
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw Error("ID " + id + ": " + (data.error ?? "Overenie zlyhalo."));
        try { verified.push(validatedAdminBulkPreview(id, data)); }
        catch { throw Error("ID " + id + ": server neposlal overiteľnú identitu."); }
      }
      if (verified.length !== ids.length) throw Error("Nepodarilo sa overiť celý výber.");
      setPreviews(verified);
      setPhase("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Overenie výberu zlyhalo.");
      setPhase("idle");
    }
  }

  async function confirm() {
    if (phase !== "ready" || !previews.length || disabled) return;
    const frozen = [...previews];
    setPhase("deleting");
    setError("");
    const outcome = await runSequentialAdminRemovals(frozen, async item => {
      const response = await fetch(endpoint(kind, item.id), {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "delete", confirmed: true, localOnly: !item.notionLinked,
          expectedSlug: item.slug, expectedName: item.name,
          expectedCategory: item.category,
        }),
      });
      const result = await response.json() as LifecycleResult;
      if (!response.ok) throw Error(result.error ?? "Server nepotvrdil odstránenie.");
      return result.state ?? "";
    }, (count, pending) => {
      setDone(count);
      setPendingCount(pending);
    });
    setFailureId(outcome.failedId);
    setError(outcome.error);
    setFinishedIds(outcome.acknowledgedIds);
    setPhase("result");
  }

  function close() {
    if (working) return;
    const toRefresh = phase === "result" ? finishedIds : [];
    setPhase("idle");
    setPreviews([]);
    setFinishedIds([]);
    if (toRefresh.length) onFinished(toRefresh);
  }

  return <>
    <AdminActionButton variant="destructive" type="button"
      disabled={!canStart} onClick={() => void prepare()}>
      Natrvalo odstrániť vybrané
    </AdminActionButton>
    {phase === "idle" && error && <p role="alert" className="admin-flash">{error}</p>}
    <AdminModalDialog
      open={phase !== "idle"}
      title={phase === "result" ? "Výsledok hromadného odstránenia" : "Natrvalo odstrániť vybrané záznamy?"}
      description="Odstránenie používa kontrolu identity a existujúci bezpečný D1/Notion lifecycle pre každé ID."
      onClose={close}
      footer={<>
        {phase !== "result" && <AdminActionButton variant="neutral" disabled={working}
          data-admin-autofocus="true" onClick={close}>Zrušiť</AdminActionButton>}
        {phase === "ready" && <AdminActionButton variant="destructive" onClick={() => void confirm()}>
          Potvrdiť odstránenie {previews.length} záznamov
        </AdminActionButton>}
        {phase === "result" && <AdminActionButton variant="primary" onClick={close}>Zavrieť výsledok</AdminActionButton>}
      </>}
    >
      {phase === "preparing" && <p role="status">Overujem ID a prepojenia všetkých vybraných záznamov…</p>}
      {phase === "ready" && <>
        <p><strong>Na odstránenie: {previews.length} záznamov.</strong> Toto je nevratná akcia
          v Admine. Prepojené stránky sa presunú do koša Notion až po overení ich vlastníctva.</p>
        <p>Bez overeného prepojenia s Notionom sa záznam odstráni iba z Psipedie.</p>
        <ul style={{maxHeight: 280, overflow: "auto", paddingLeft: 20}}>
          {previews.map(item => <li key={item.id}>
            <strong>#{item.id} – {item.name}</strong> · {item.category} ·
            {item.notionLinked ? " Notion (" + item.notionPages + " stránok)" : " iba Psipedia"}
          </li>)}
        </ul>
        <p>Každý záznam sa pred odstránením znovu overí. Pri chybe sa dávka okamžite zastaví.</p>
      </>}
      {phase === "deleting" && <p role="status">Potvrdené: {done} z {previews.length}. Ďalšie záznamy sa spracujú postupne.</p>}
      {phase === "result" && <>
        <p role="status">Potvrdené: <strong>{done} z {previews.length}</strong>.
          {pendingCount > 0 && " Z toho " + pendingCount + " čaká na dokončenie Notion/D1."}
        </p>
        {error && <p role="alert">Zastavené pri ID #{failureId}: {error}.
          Zostávajúce záznamy sa neodstraňovali. Skontroluj stav pred opakovaním.</p>}
        {!error && <p>Dávka bola prijatá. Úplné dokončenie všetkých záznamov závisí od stavu Notionu.</p>}
      </>}
    </AdminModalDialog>
  </>;
}
