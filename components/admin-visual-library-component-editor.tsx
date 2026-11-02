"use client";

import { useEffect, useState } from "react";
import {
  PublicActionLink, PublicDataCard, PublicLandingHero, PublicSectionHeader,
} from "@/components/public-visual-system/public-visual-system";
import {
  isVisualComponentProposalId, validateVisualComponentProposal,
  visualComponentProposalPresets, type VisualComponentProposal,
  type VisualComponentProposalId,
} from "@/lib/visual-library-component-proposals";
import styles from "./admin-visual-library.module.css";

const URL = "/api/admin/visual-library/component-drafts";
type SavedDraft = {
  id: VisualComponentProposalId;
  revision: number;
  draft: VisualComponentProposal;
};

const FIELD_LABELS: Record<keyof VisualComponentProposal, string> = {
  eyebrow: "Malý nadpis",
  title: "Hlavný nadpis",
  description: "Popis / druhá akcia",
  actionLabel: "Text tlačidla / tretia akcia",
};

function ProposalPreview({
  id, draft,
}: { id: VisualComponentProposalId; draft: VisualComponentProposal }) {
  switch (id) {
    case "actions":
      return <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"center",padding:14}}>
        <PublicActionLink href="/adresar" variant="primary">{draft.title}</PublicActionLink>
        <PublicActionLink href="/plemena" variant="secondary">{draft.description}</PublicActionLink>
        <PublicActionLink href="/clanky" variant="tertiary">{draft.actionLabel}</PublicActionLink>
      </div>;
    case "section-header":
      return <PublicSectionHeader eyebrow={draft.eyebrow} title={draft.title} intro={draft.description} />;
    case "data-card":
      return <PublicDataCard href="/adresar" eyebrow={draft.eyebrow}
        title={draft.title} description={draft.description} meta="Slovensko"
        actionLabel={draft.actionLabel} />;
    case "landing-hero-events":
      return <PublicLandingHero tone="events" eyebrow={draft.eyebrow}
        title={draft.title} intro={draft.description} />;
  }
}

export function AdminVisualLibraryComponentEditor({sampleId}: {sampleId:string}) {
  if (!isVisualComponentProposalId(sampleId)) return null;
  return <ComponentProposalEditor key={sampleId} id={sampleId} />;
}

function ComponentProposalEditor({id}: {id:VisualComponentProposalId}) {
  const preset = visualComponentProposalPresets[id];
  const [draft, setDraft] = useState<VisualComponentProposal>({...preset.original});
  const [saved, setSaved] = useState<SavedDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(URL + "?id=" + encodeURIComponent(id), {
      cache: "no-store", credentials: "same-origin", signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json() as {draft?:SavedDraft|null;error?:string};
      if (!response.ok) throw new Error(result.error ?? "Návrh sa nepodarilo načítať.");
      return result;
    }).then((result) => {
      if (controller.signal.aborted) return;
      setSaved(result.draft ?? null);
      setDraft(result.draft?.draft ?? {...preset.original});
      setDirty(false);
      setStatus(result.draft ? "Načítaný uložený návrh zo servera." :
        "Uprav náhľad a ulož vlastný návrh.");
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setStatus(error instanceof Error ? error.message : "Načítanie zlyhalo.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [id, preset]);

  const edit = (field: keyof VisualComponentProposal, value: string) => {
    setDraft((current) => ({...current,[field]:value}));
    setDirty(true);
    setStatus("");
  };

  let valid = true;
  try { validateVisualComponentProposal(id,draft); } catch { valid = false; }

  const save = async () => {
    if (!valid || busy || loading) return;
    setBusy(true);
    try {
      const response = await fetch(URL, {
        method: "PUT", credentials: "same-origin",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({id, revision:saved?.revision??0, draft}),
      });
      const data = await response.json() as {draft?:SavedDraft;error?:string};
      if (!response.ok || !data.draft) {
        throw new Error(data.error ?? "Uloženie návrhu sa nepodarilo.");
      }
      setSaved(data.draft);
      setDraft(data.draft.draft);
      setDirty(false);
      setStatus("Uložený nový návrh na server. Verejný web sa nezmenil.");
    } catch(error) {
      setStatus(error instanceof Error ? error.message : "Uloženie zlyhalo.");
    } finally {setBusy(false);}
  };

  const copy = async () => {
    if (!valid) return;
    const report = [
      "Psipedia – návrh úpravy spoločného komponentu",
      "Ukážka: " + preset.label + " (" + id + ")",
      ...preset.fields.map((field) => FIELD_LABELS[field] + ": " + draft[field]),
      "Verejné umiestnenia zatiaľ nie sú úplne overené.",
      "Zostáva len návrh; nič sa nepublikuje. Mobil bez zásahu.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setStatus("Návrh skopírovaný na kontrolu implementácie.");
    } catch { setStatus("Kopírovanie sa nepodarilo."); }
  };

  return <section className={styles.editor} aria-label={"Návrh úpravy: "+preset.label}>
    <div className={styles.editorHeading}>
      <div>
        <h4>Upraviť návrh spoločného prvku</h4>
        <p>Tu môžeš skúšať texty v skutočnom komponente a uložiť ich na server.
          Zmeny zatiaľ nezasahujú do verejných stránok.</p>
      </div>
      <span className={styles.readOnly}>Iba návrh</span>
    </div>
    <div className={styles.editorFields}>
      {preset.fields.map((field) => <label key={field}>
        {id === "actions" && field === "title" ? "Text primárnej akcie"
          : id === "actions" && field === "description" ? "Text sekundárnej akcie"
          : id === "actions" && field === "actionLabel" ? "Text tretej akcie"
          : FIELD_LABELS[field]}
        {field === "description" ? <textarea rows={2} maxLength={360}
          value={draft[field]} onChange={(event) => edit(field,event.target.value)} />
          : <input maxLength={field === "eyebrow" ? 100 : field === "actionLabel" ? 80 : 140}
            value={draft[field]} onChange={(event) => edit(field,event.target.value)} />}
      </label>)}
    </div>
    <strong className={styles.editorPreviewTitle}>Živý náhľad návrhu</strong>
    <div className={styles.editorPreview}>
      <div className={styles.previewComponent} inert>
        <ProposalPreview id={id} draft={draft} />
      </div>
    </div>
    <div className={styles.editorActions}>
      <button type="button" className={styles.moreButton} disabled={busy||loading}
        onClick={() => {
          setDraft({...preset.original});setDirty(true);
          setStatus("Pôvodné texty obnovené v náhľade. Ulož ich, ak majú nahradiť návrh.");
        }}>Obnoviť pôvodné</button>
      <button type="button" className={styles.editorSave}
        disabled={loading||busy||!valid||!dirty} onClick={() => void save()}>
        {busy ? "Ukladám…" : "Uložiť návrh na server"}
      </button>
      <button type="button" className={styles.moreButton} disabled={!valid}
        onClick={() => void copy()}>Skopírovať návrh</button>
    </div>
    <div className={styles.publishPanel}>
      <h5>Publikovanie spoločnej šablóny</h5>
      <p>
        Zatiaľ nie je povolené. Na server sa ukladá iba pracovný návrh.
        Pred povolením publikovania treba potvrdiť všetky dotknuté URL a
        zabezpečiť samostatný desktopový vzhľad bez zmeny mobilu.
      </p>
      <p>Verzia návrhu: {saved?.revision ?? "neuložený"}</p>
    </div>
    <p className={styles.editorScope}>
      Žiadna úprava farieb, fotografie, CSS ani žiadne publikovanie neprebieha automaticky.
    </p>
    <p role="status" aria-live="polite" className={styles.editorMessage}>
      {status || "Návrh bez zásahu do verejného webu."}
    </p>
  </section>;
}
