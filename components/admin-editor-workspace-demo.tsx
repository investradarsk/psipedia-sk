"use client";

import { useState } from "react";
import { AdminActionButton, AdminModalDialog } from "@/components/admin-interaction-system";
import {
  EditorActionBar,
  EditorSection,
  EditorStatus,
  EditorWorkspace,
  type EditorWorkspaceSection,
} from "@/components/admin-editor-workspace";

type LocalDraft = { name: string; description: string; email: string };
const example: LocalDraft = {
  name: "Ukážkový profil",
  description: "Výhradne lokálne testovacie údaje. Nikam sa neodosielajú.",
  email: "example@example.test",
};
const sections: EditorWorkspaceSection[] = [
  { id: "demo-basic", label: "Základné informácie" },
  { id: "demo-contact", label: "Kontakt" },
];

// Only the development-only preview route imports this component.
export function AdminEditorWorkspaceDemo() {
  const [mode, setMode] = useState<"modal" | "page">("modal");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LocalDraft>(example);
  const [saved, setSaved] = useState<LocalDraft>(example);
  const [published, setPublished] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = draft.name !== saved.name || draft.description !== saved.description || draft.email !== saved.email;

  const closeEditor = () => {
    setOpen(false);
    setDraft(saved);
    setMessage("");
  };
  const saveDraft = () => {
    setSaved({ ...draft });
    setMessage("Koncept uložený iba do lokálneho stavu.");
  };

  return (
    <div style={{ maxWidth: "94rem", margin: "2rem auto", padding: "1rem" }}>
      <h1>Izolovaný test spoločného editora V3</h1>
      <p>Výhradne development, fiktívne údaje, žiadne API požiadavky ani publikovanie.</p>
      <label htmlFor="demo-mode">Zobrazenie</label>
      <select id="demo-mode" value={mode} onChange={(event) => setMode(event.target.value as "modal" | "page")}>
        <option value="modal">Modálne okno</option>
        <option value="page">Samostatná stránka</option>
      </select>
      {mode === "modal" && (
        <p>
          <AdminActionButton variant="primary" onClick={() => setOpen(true)}>
            Otvoriť testovací editor
          </AdminActionButton>
        </p>
      )}
      <EditorWorkspace
        key={mode}
        mode={mode}
        open={mode === "page" || open}
        title="Upraviť koncept — lokálna ukážka"
        description="Jeden spoločný workspace, vlastné polia canonical editora."
        status={<EditorStatus label={published ? "Lokálne publikované" : "Nezverejnený koncept"} tone={published ? "success" : "neutral"} />}
        sections={sections}
        previewTitle="Náhľad profilu"
        preview={
          <div data-demo-preview>
            <h3>{draft.name || "Bez názvu"}</h3>
            <p>{draft.description}</p>
            <p>{draft.email}</p>
          </div>
        }
        dirty={dirty}
        onClose={closeEditor}
        actions={
          <EditorActionBar
            message={message}
            secondary={<AdminActionButton variant="secondary" onClick={saveDraft}>Uložiť koncept</AdminActionButton>}
            primary={<AdminActionButton variant="primary" onClick={() => setPublishConfirm(true)}>Publikovať…</AdminActionButton>}
          />
        }
      >
        <EditorSection id="demo-basic">
          <h2>Základné informácie</h2>
          <label htmlFor="demo-name">Názov profilu</label>
          <input id="demo-name" value={draft.name}
            onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))} />
          <label htmlFor="demo-description">Krátky popis</label>
          <textarea id="demo-description" rows={5} value={draft.description}
            onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))} />
        </EditorSection>
        <EditorSection id="demo-contact">
          <h2>Kontakt</h2>
          <label htmlFor="demo-email">Kontaktný e-mail</label>
          <input id="demo-email" type="email" value={draft.email}
            onChange={(event) => setDraft((previous) => ({ ...previous, email: event.target.value }))} />
        </EditorSection>
      </EditorWorkspace>
      <AdminModalDialog
        open={publishConfirm}
        title="Potvrdiť publikovanie?"
        description="Ukážka zmení len lokálny stav. Skutočné publikovanie patrí canonical editoru."
        onClose={() => setPublishConfirm(false)}
        footer={
          <>
            <AdminActionButton variant="neutral" onClick={() => setPublishConfirm(false)}>Zrušiť</AdminActionButton>
            <AdminActionButton variant="primary" onClick={() => {
              setPublished(true);
              setSaved({ ...draft });
              setMessage("Publikovanie simulované výhradne lokálne.");
              setPublishConfirm(false);
            }}>Potvrdiť lokálne publikovanie</AdminActionButton>
          </>
        }
      >
        <p>Uloženie konceptu ani otvorenie editora samo osebe nič nepublikuje.</p>
      </AdminModalDialog>
    </div>
  );
}
