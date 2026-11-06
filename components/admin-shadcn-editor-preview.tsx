"use client";

import { useState } from "react";
import { AdminModalDialog, AdminActionButton } from "@/components/admin-interaction-system";
import {
  AdminUiInput,
  AdminUiTextarea,
  AdminUiSelect,
  AdminUiCheckbox,
} from "@/components/admin-shadcn-editor-primitives";
import {
  AdminUnifiedEditorField,
  AdminUnifiedEditorFields,
  AdminUnifiedEditorWorkspace,
  type AdminUnifiedEditorSection,
} from "@/components/admin-unified-editor-workspace";
import styles from "./admin-shadcn-editor.module.css";

type Kind = "breed" | "article" | "directory" | "event";
type Sample = {
  title: string;
  category: string;
  summary: string;
  description: string;
  city: string;
  contact: string;
  date: string;
  time: string;
  extra: string;
  featured: boolean;
};
const kindLabels: Record<Kind, string> = {
  breed: "Plemeno",
  article: "Článok",
  directory: "Služba pre psov",
  event: "Podujatie",
};
const categoryOptions: Record<Kind, string[]> = {
  breed: ["Stavač", "Retríver", "Ovčiak"],
  article: ["Výcvik", "Zdravie", "Šteniatka"],
  directory: ["Psí tréner", "Veterinár", "Psí salón"],
  event: ["Výstava", "Preteky", "Seminár"],
};
const defaults: Record<Kind, Sample> = {
  breed: {
    title: "Nemecký krátkosrstý stavač", category: "Stavač", summary: "Aktívny, všestranný poľovnícky pes.",
    description: "Ukážka dlhšieho odborného obsahu. Editor musí zostať pohodlný aj pri rozsiahlych textoch, bez ďalšieho posuvníka.\n\nV skutočnej Psipedii zostanú všetky údaje FCI, zdravotné polia a prepojenia zachované.",
    city: "Nemecko", contact: "", date: "", time: "", extra: "FCI 119", featured: false,
  },
  article: {
    title: "Ako správne začať s výcvikom psa", category: "Výcvik", summary: "Praktický úvod do základného tréningu.",
    description: "Toto je len vzor obsahu. V ostrých článkoch zostane Lexical, obrázky, autor aj existujúce publikovanie a SEO.",
    city: "", contact: "", date: "", time: "", extra: "Redakčný článok", featured: false,
  },
  directory: {
    title: "Psia škola – ukážka", category: "Psí tréner", summary: "Individuálny aj skupinový výcvik psov.",
    description: "Profil služby môže mať rozsiahly opis, kategóriové filtre, kontakty aj samostatný katalóg Services V3.",
    city: "Nitra", contact: "+421 900 000 000", date: "", time: "", extra: "Individuálny výcvik", featured: false,
  },
  event: {
    title: "Klubová výstava – ukážka", category: "Výstava", summary: "Jednodňové podujatie pre majiteľov psov.",
    description: "Na tomto príklade vidno dátum, čas a kontakt organizátora. Sú to ilustračné polia, zatiaľ nie zmeny databázy.",
    city: "Nitra", contact: "+421 900 000 000", date: "2026-11-14", time: "09:00", extra: "Vstup dobrovoľný", featured: false,
  },
};

export function AdminShadcnEditorPreview() {
  const [kind, setKind] = useState<Kind>("breed");
  const [drafts, setDrafts] = useState<Record<Kind, Sample>>(() => structuredClone(defaults));
  const [saved, setSaved] = useState<Record<Kind, Sample>>(() => structuredClone(defaults));
  const [published, setPublished] = useState<Record<Kind, boolean>>({ breed: false, article: false, directory: false, event: false });
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [message, setMessage] = useState("Nič sa neukladá na server.");
  const draft = drafts[kind];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved[kind]);

  function change<K extends keyof Sample>(key: K, value: Sample[K]) {
    setDrafts((current) => ({ ...current, [kind]: { ...current[kind], [key]: value } }));
    setMessage("Rozpracované lokálne zmeny.");
  }
  function save() {
    setSaved((current) => ({ ...current, [kind]: { ...draft } }));
    setMessage("Lokálny koncept uložený iba v pamäti tejto ukážky.");
  }
  function discard() {
    setDrafts((current) => ({ ...current, [kind]: { ...saved[kind] } }));
    setMessage("Neuložené lokálne zmeny zahodené.");
  }

  const detailLabel = kind === "breed" ? "Údaj FCI / zameranie" : kind === "event" ? "Vstupné / podmienky" : kind === "directory" ? "Ponuka služieb" : "Redakčné zaradenie";
  const sections: AdminUnifiedEditorSection[] = [
    {
      id: "basic", label: "Základné údaje", description: "Kompaktné polia vedľa seba; dlhší názov zaberie šírku podľa potreby.",
      content: <AdminUnifiedEditorFields>
        <AdminUnifiedEditorField id="demo-title" label="Názov" required wide>
          <AdminUiInput id="demo-title" required value={draft.title} onChange={(event) => change("title", event.target.value)} />
        </AdminUnifiedEditorField>
        <AdminUnifiedEditorField id="demo-category" label="Typ alebo kategória">
          <AdminUiSelect id="demo-category" value={draft.category} onChange={(event) => change("category", event.target.value)}>
            {categoryOptions[kind].map((option) => <option key={option} value={option}>{option}</option>)}
          </AdminUiSelect>
        </AdminUnifiedEditorField>
        <AdminUnifiedEditorField id="demo-city" label={kind === "breed" ? "Krajina pôvodu" : "Mesto / lokalita"}>
          <AdminUiInput id="demo-city" value={draft.city} onChange={(event) => change("city", event.target.value)} />
        </AdminUnifiedEditorField>
      </AdminUnifiedEditorFields>,
    },
    {
      id: "text", label: "Popisy a obsah", description: "Krátky text zostáva kompaktný. Odborný obsah má celú šírku a rastie s textom.",
      content: <AdminUnifiedEditorFields>
        <AdminUnifiedEditorField id="demo-summary" label="Krátky úvod" wide>
          <AdminUiTextarea id="demo-summary" length="short" rows={3} value={draft.summary} onChange={(event) => change("summary", event.target.value)} />
        </AdminUnifiedEditorField>
        <AdminUnifiedEditorField id="demo-description" label="Podrobný obsah" wide hint="V reálnych editoroch zostane obsahový formát a existujúci Lexical.">
          <AdminUiTextarea id="demo-description" length="long" rows={10} value={draft.description} onChange={(event) => change("description", event.target.value)} />
        </AdminUnifiedEditorField>
      </AdminUnifiedEditorFields>,
    },
    {
      id: "details", label: kind === "event" ? "Termín a podrobnosti" : "Špecifické údaje", description: "Typovo odlišné polia v rovnakom dizajne.",
      content: <AdminUnifiedEditorFields>
        <AdminUnifiedEditorField id="demo-extra" label={detailLabel} wide={kind === "breed"}>
          <AdminUiInput id="demo-extra" value={draft.extra} onChange={(event) => change("extra", event.target.value)} />
        </AdminUnifiedEditorField>
        {kind === "event" ? <>
          <AdminUnifiedEditorField id="demo-date" label="Dátum začiatku">
            <AdminUiInput id="demo-date" type="date" value={draft.date} onChange={(event) => change("date", event.target.value)} />
          </AdminUnifiedEditorField>
          <AdminUnifiedEditorField id="demo-time" label="Čas začiatku">
            <AdminUiInput id="demo-time" type="time" value={draft.time} onChange={(event) => change("time", event.target.value)} />
          </AdminUnifiedEditorField>
        </> : null}
        <div className={styles.field} data-wide="true">
          <label className={styles.checkboxRow}>
            <AdminUiCheckbox checked={draft.featured} onChange={(event) => change("featured", event.target.checked)} />
            Označiť ako odporúčaný obsah (iba ukážka)
          </label>
        </div>
      </AdminUnifiedEditorFields>,
    },
    {
      id: "contacts", label: "Kontakty a prepojenia", description: "Jednotné ovládanie, ale polia podľa skutočného typu profilu.",
      content: <AdminUnifiedEditorFields>
        <AdminUnifiedEditorField id="demo-contact" label={kind === "event" ? "Telefón organizátora (návrh)" : "Kontaktné číslo / odkaz"} wide>
          <AdminUiInput id="demo-contact" type="tel" value={draft.contact} onChange={(event) => change("contact", event.target.value)} placeholder="+421 ..." />
        </AdminUnifiedEditorField>
        <div className={styles.mutedBlock} style={{ gridColumn: "1 / -1" }}>
          Prepojenia plemien, kategóriové služby, mapy a partneri zostanú samostatnými špecializovanými ovládacími prvkami.
        </div>
      </AdminUnifiedEditorFields>,
    },
    {
      id: "media", label: "Fotografie a publikovanie", description: "Zjednotená plocha pre obrázky a technické nastavenia.",
      content: <div className={styles.mutedBlock}>
        Vzorový priestor pre existujúce uploady, galérie, výrez fotografie, SEO a voliteľné nastavenia Notion.
        Nič sa nenahráva a žiadne publikovanie do Psipedie sa nevykonáva.
      </div>,
    },
  ];

  return (
    <div data-unified-editor-demo className={styles.workspace}>
      <div className={styles.demoToolbar}>
        <label htmlFor="demo-kind">Typ záznamu
          <AdminUiSelect id="demo-kind" value={kind} onChange={(event) => { setKind(event.target.value as Kind); setMessage("Nič sa neukladá na server."); }}>
            {(Object.keys(kindLabels) as Kind[]).map((value) => <option key={value} value={value}>{kindLabels[value]}</option>)}
          </AdminUiSelect>
        </label>
        <p className={styles.demoNote}>Izolovaná ukážka nového UI. Formulár nevolá API, nemení D1, Notion ani verejný web. Po prepnutí typu záznamu ostanú lokálne rozpracované hodnoty zachované.</p>
      </div>
      <form noValidate onSubmit={(event) => { event.preventDefault(); save(); }}>
        <AdminUnifiedEditorWorkspace key={kind} sections={sections}
          status={<span className={styles.badge}>{kindLabels[kind]} · {published[kind] ? "Lokálne publikované" : "Koncept"}{isDirty ? " · Neuložené zmeny" : ""}</span>}
          preview={<><h3>{draft.title || "Bez názvu"}</h3><p>{draft.summary}</p><p>{draft.city}</p><p>{draft.contact}</p></>}
          previewLabel="Ukázať živý náhľad"
          actions={<>
            <span className={styles.statusLine} role="status" aria-live="polite">{message}</span>
            <div className={styles.actionGroup}>
              <button type="button" className={styles.buttonQuiet} disabled={!isDirty} onClick={discard}>Zahodiť zmeny</button>
              <button type="submit" className={styles.buttonSecondary}>Uložiť lokálne</button>
              <button type="button" className={styles.buttonPrimary} onClick={() => setConfirmPublish(true)}>Simulovať publikovanie</button>
            </div>
          </>}
        />
      </form>
      <AdminModalDialog open={confirmPublish} onClose={() => setConfirmPublish(false)}
        title="Simulovať publikovanie?"
        description="V tejto ukážke sa nezmení žiaden skutočný záznam ani jeho stav."
        footer={<>
          <AdminActionButton variant="neutral" onClick={() => setConfirmPublish(false)}>Zrušiť</AdminActionButton>
          <AdminActionButton variant="primary" onClick={() => { save(); setPublished((current) => ({ ...current, [kind]: true })); setMessage("Publikovanie simulované iba lokálne."); setConfirmPublish(false); }}>Potvrdiť lokálnu simuláciu</AdminActionButton>
        </>}>
        <p>Údaje zostávajú iba v pamäti prehliadača počas tohto otvorenia stránky.</p>
      </AdminModalDialog>
    </div>
  );
}
