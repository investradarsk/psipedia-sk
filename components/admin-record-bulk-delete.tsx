"use client";

import { useState } from "react";
import { AdminActionButton, AdminModalDialog } from "@/components/admin-interaction-system";
import type { RecordKind } from "@/lib/admin-record-lifecycle";

export const ADMIN_BULK_DELETE_LIMIT = 25;

type LifecyclePreview = {
  id: number;
  name: string;
  slug: string;
  category: string;
  notionLinked: boolean;
  notionPages: number;
  removalState: string | null;
};
type LifecycleResult = {
  state?: string;
  error?: string;
};
type Phase = "idle" | "preparing" | "ready" | "deleting" | "result";

function exactIds(value: readonly number[]): number[] | null {
  if (value.some(id => !Number.isSafeInteger(id) || id <= 0)) return null;
  return [...new Set(value)];
}

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
  const [previews, setPreviews] = useState<LifecyclePreview[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [failureId, setFailureId] = useState<number | null>(null);
  const [finishedIds, setFinishedIds] = useState<number[]>([]);
  const working = phase === "preparing" || phase === "deleting";
  const canStart = !disabled && phase === "idle" && selectedIds.length > 0;

  async function prepare() {
    if (!canStart) return;
    const ids = exactIds(selectedIds);
    if (!ids || !ids.length) {
      setError("Výber obsahuje neplatné ID. Obnov zoznam.");
      return;
    }
    if (ids.length > ADMIN_BULK_DELETE_LIMIT) {
      setError("Na jednu dávku vyber najviac " + ADMIN_BULK_DELETE_LIMIT + " záznamov.");
      return;
    }
    setPhase("preparing");
    setError("");
    setPreviews([]);
    setFailureId(null);
    setDone(0);
    setPendingCount(0);
    setFinishedIds([]);
    const verified: LifecyclePreview[] = [];
    try {
      // Preflight never performs a mutation. Freeze exact IDs before opening the dialog.
      for (const id of ids) {
        const response = await fetch(endpoint(kind, id), {
          credentials: "same-origin", cache: "no-store",
        });
        const item = await response.json() as LifecyclePreview & { error?: string };
        if (!response.ok) throw Error("ID " + id + ": " + (item.error ?? "Overenie zlyhalo."));
        if (item.id !== id || typeof item.name !== "string" || !item.name.trim() ||
            typeof item.slug !== "string" || typeof item.category !== "string" ||
            typeof item.notionLinked !== "boolean" ||
            !Number.isSafeInteger(item.notionPages) || item.notionPages < 0) {
          throw Error("ID " + id + ": server neposlal overiteľnú identitu.");
        }
        verified.push(item);
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
    const acknowledged: number[] = [];
    let pending = 0;
    let failed: number | null = null;
    let failure = "";
    // Deliberately sequential; the existing per-record route owns authorization,
    // Notion ownership checks, D1 tombstones and cache invalidation.
    for (const item of frozen) {
      try {
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
        if (!response.ok || !["COMPLETE", "PENDING_NOTION", "ERROR_NOTION", "READY_LOCAL"].includes(result.state ?? "")) {
          throw Error(result.error ?? "Server nepotvrdil odstránenie.");
        }
        acknowledged.push(item.id);
        if (result.state !== "COMPLETE") pending++;
        setDone(acknowledged.length);
        setPendingCount(pending);
      } catch (caught) {
        failed = item.id;
        failure = caught instanceof Error ? caught.message : "Odstránenie zlyhalo.";
        // Fail closed: do not send the rest of the batch after any failure.
        break;
      }
    }
    setFailureId(failed);
    setError(failure);
    setFinishedIds(acknowledged);
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
