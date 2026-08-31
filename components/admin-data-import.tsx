"use client";

import { FormEvent, useState } from "react";
import { directoryCategories } from "@/lib/directory";

type ImportPayload = {
  articles?: unknown[];
  profiles?: unknown[];
  events?: unknown[];
  helpItems?: unknown[];
  inquiries?: unknown[];
  legal?: Record<string, unknown>;
  profileCategory?: string;
};

type BreedImportPreview = {
  total:number;created:number;updated:number;skipped:number;published:number;draft:number;
  errors:Array<{index:number;field:string;message:string}>;
  duplicateFciNumbers:number[];duplicateImportKeys:string[];duplicateSlugs:string[];
};

const inputs = [
  { name: "articles", label: "Články a koncepty", sourceKey: "articles" },
  { name: "profiles", label: "Služby pre psov", sourceKey: "profiles" },
  { name: "events", label: "Podujatia", sourceKey: "events" },
  { name: "helpItems", label: "Pomoc psom", sourceKey: "items" },
  { name: "legal", label: "Právne nastavenia", sourceKey: "settings" },
  { name: "inquiries", label: "Dopyty", sourceKey: "inquiries" },
] as const;

async function readJson(file: File): Promise<unknown> {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} je príliš veľký.`);
  return JSON.parse(await file.text()) as unknown;
}

function AdminBreedImport(){
  const [file,setFile]=useState<File>();const [preview,setPreview]=useState<BreedImportPreview>();const [payload,setPayload]=useState<unknown[]>();
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("");
  async function load(){if(!file)throw new Error("Vyber READY JSON súbor s plemenami.");const json=await readJson(file);if(!json||typeof json!=="object"||Array.isArray(json)||!Array.isArray((json as Record<string,unknown>).breeds))throw new Error("JSON musí obsahovať top-level pole breeds.");return (json as {breeds:unknown[]}).breeds;}
  async function check(){setBusy(true);setMessage("");setError("");try{const breeds=await load();const response=await fetch("/api/admin/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({breeds,preview:true})});const data=await response.json() as {preview?:BreedImportPreview;error?:string};if(!response.ok||!data.preview)throw new Error(data.error||"Preview importu sa nepodaril.");setPayload(breeds);setPreview(data.preview);if(!data.preview.errors.length)setMessage("Kontrola je hotová. Import ešte nebol spustený.");}catch(nextError){setError(nextError instanceof Error?nextError.message:"Preview importu sa nepodaril.");setPreview(undefined);setPayload(undefined);}finally{setBusy(false);}}
  async function run(){if(!payload||!preview||preview.errors.length)return;setBusy(true);setMessage("");setError("");try{const response=await fetch("/api/admin/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({breeds:payload})});const data=await response.json() as {preview?:BreedImportPreview;imported?:{breeds?:BreedImportPreview};error?:string};const result=data.imported?.breeds??data.preview;if(!response.ok||!result)throw new Error(data.error||result?.errors?.map((item)=>`Riadok ${item.index}: ${item.message}`).join(" ")||"Import plemien sa nepodaril.");setPreview(result);setMessage(`Import je hotový: ${result.created} vytvorených, ${result.updated} aktualizovaných, ${result.skipped} preskočených.`);}catch(nextError){setError(nextError instanceof Error?nextError.message:"Import plemien sa nepodaril.");}finally{setBusy(false);}}
  return <section className="admin-panel admin-import-panel admin-breed-import"><div className="admin-card-heading"><div><span>FCI</span><div><h2>Plemená</h2><p>Bezpečný idempotentný import READY JSON. Najprv sa vždy zobrazí preview; existujúce redakčné údaje sa neprepisujú prázdnymi hodnotami.</p></div></div></div><label><span>psipedia_plemena_344_READY.json alebo rozšírený master JSON</span><input type="file" accept="application/json,.json" onChange={(event)=>{setFile(event.target.files?.[0]);setPreview(undefined);setPayload(undefined);setMessage("");setError("");}}/></label><details className="admin-fci-editor-section"><summary>Voliteľný redakčný obsah v importe</summary><p className="admin-field-help">Každé plemeno môže obsahovať objekt <code>redakcny_profil</code>. Chýbajúce alebo prázdne hodnoty nikdy nevymažú text upravený ručne v adminovi.</p><p className="admin-field-help"><strong>Texty:</strong> <code>uvod</code>, <code>prehlad_plemena</code>, <code>povaha</code>, <code>historia</code>, <code>pohyb_a_denne_potreby</code>, <code>vycvik_a_vychova</code>, <code>zdravie_a_starostlivost</code>, <code>srst_a_udrzba</code>, <code>zivot_s_rodinou_a_detmi</code>, <code>vztah_k_inym_psom</code>, <code>zaujimavosti</code>, <code>caste_chyby_majitelov</code> a štyri polia <code>odporucanie_*</code>.</p><p className="admin-field-help"><strong>Zoznamy:</strong> <code>zdravotne_rizika</code>, <code>vhodny_pre</code>, <code>na_co_si_dat_pozor</code>. <strong>Karty:</strong> <code>hlavne_vlastnosti</code> a <code>sporty</code> s názvom, hodnotením 1–5 a voliteľnou poznámkou.</p></details><div className="admin-editor-actions"><button type="button" disabled={busy||!file} onClick={()=>void check()}>{busy?"Kontrolujem…":"Skontrolovať import"}</button><button type="button" className="is-primary" disabled={busy||!preview||preview.errors.length>0||!payload} onClick={()=>void run()}>Importovať plemená</button></div>{preview&&<div className="admin-import-preview" aria-live="polite"><div><span>Záznamov</span><strong>{preview.total}</strong></div><div><span>Nových</span><strong>{preview.created}</strong></div><div><span>Aktualizovaných</span><strong>{preview.updated}</strong></div><div><span>Publikovaných</span><strong>{preview.published}</strong></div><div><span>Konceptov</span><strong>{preview.draft}</strong></div><div><span>Chýb</span><strong>{preview.errors.length}</strong></div></div>}{preview?.errors.length?<ul className="admin-import-errors">{preview.errors.slice(0,50).map((item,index)=><li key={`${item.index}-${item.field}-${index}`}>Riadok {item.index||"—"}: {item.message}</li>)}</ul>:null}{message&&<p className="admin-flash" role="status">{message}</p>}{error&&<p className="admin-editor-message is-error" role="alert">{error}</p>}</section>;
}

export function AdminDataImport() {
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileCategory, setProfileCategory] = useState("kynologicke-kluby");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(""); setError(""); setBusy(true);
    try {
      const payload: ImportPayload = {};
      let selectedFiles = 0;
      for (const input of inputs) {
        const file = files[input.name];
        if (!file) continue;
        selectedFiles += 1;
        const json = await readJson(file);
        const value = Array.isArray(json) ? json : json && typeof json === "object" ? (json as Record<string, unknown>)[input.sourceKey] : undefined;
        if (input.name === "legal") payload.legal = value as Record<string, unknown>;
        else payload[input.name] = value as unknown[];
      }
      if (!selectedFiles) throw new Error("Vyber aspoň jeden JSON súbor.");
      if (payload.profiles) payload.profileCategory = profileCategory;
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { error?: string; imported?: Record<string, number> };
      if (!response.ok) throw new Error(data.error || "Import sa nepodaril.");
      const imported = data.imported ?? {};
      setMessage(`Import je hotový: ${imported.articles ?? 0} článkov, ${imported.profiles ?? 0} profilov, ${imported.events ?? 0} podujatí a ${imported.help ?? 0} prípadov pomoci.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Import sa nepodaril.");
    } finally {
      setBusy(false);
    }
  }

  return (<>
    <AdminBreedImport />
    <form className="admin-panel admin-import-panel" onSubmit={submit}>
      <p>Vyber jeden alebo viac JSON súborov. Import aktualizuje existujúce záznamy podľa stabilného importného kľúča a nepridá ich znova.</p>
      <div className="admin-import-grid">
        {inputs.map((input) => (
          <label key={input.name}>
            <span>{input.label}</span>
            <input type="file" accept="application/json,.json" onChange={(event) => setFiles((current) => ({ ...current, [input.name]: event.target.files?.[0] }))} />
          </label>
        ))}
        <label><span>Kategória importovaných profilov</span><select value={profileCategory} onChange={(event) => setProfileCategory(event.target.value)}>{directoryCategories.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}</select></label>
      </div>
      <button className="admin-publish" type="submit" disabled={busy}>{busy ? "Importujem…" : "Importovať vybrané dáta"}</button>
      {message && <p className="admin-flash" role="status">{message}</p>}
      {error && <p className="admin-editor-message is-error" role="alert">{error}</p>}
    </form></>
  );
}
