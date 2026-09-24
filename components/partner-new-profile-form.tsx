"use client";

import Link from "next/link";
import { useState } from "react";
import { partnerOrganizationTypeLabel, partnerOrganizationTypeOptions } from "@/lib/partner-ui-labels";

type ResourceType = "DIRECTORY_PROFILE" | "HELP_ORGANIZATION";
type Candidate = {
  resourceType: ResourceType;
  canonicalId: number;
  name: string;
  categoryOrType: string;
  city: string;
  status: string;
  publicHref: string | null;
  claimHref: string | null;
  confidence: "HIGH" | "MEDIUM";
  reasons: string[];
};

type DirectoryCategory = { slug: string; label: string };

const emptyDirectory = {
  name: "", category: "", excerpt: "", description: "", services: "", qualifications: "",
  city: "", district: "", region: "", address: "", online: false, priceNote: "",
  websiteUrl: "", publicPhone: "", publicEmail: "", facebookUrl: "", instagramUrl: "",
};
const emptyOrganization = {
  name: "", legalName: "", registrationNumber: "", type: "OTHER", shortDescription: "", description: "",
  publicEmail: "", publicPhone: "", websiteUrl: "", facebookUrl: "", instagramUrl: "",
  address: "", city: "", district: "", region: "", countryCode: "SK",
};

export function PartnerNewProfileForm({ categories }: { categories: readonly DirectoryCategory[] }) {
  const [resourceType, setResourceType] = useState<ResourceType>("DIRECTORY_PROFILE");
  const [directory, setDirectory] = useState(emptyDirectory);
  const [organization, setOrganization] = useState(emptyOrganization);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [duplicateConfidence, setDuplicateConfidence] = useState<"NONE" | "MEDIUM" | "HIGH">("NONE");
  const [state, setState] = useState<"idle" | "scanning" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const profile = resourceType === "DIRECTORY_PROFILE"
    ? {
        ...directory,
        services: directory.services.split("\n").map((item) => item.trim()).filter(Boolean),
        qualifications: directory.qualifications.split("\n").map((item) => item.trim()).filter(Boolean),
      }
    : organization;

  async function scan() {
    setState("scanning");
    setMessage("");
    const response = await fetch("/api/partner/new-profile/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceType, profile }),
    });
    const data = await response.json() as { error?: string; confidence?: "NONE"|"MEDIUM"|"HIGH"; candidates?: Candidate[] };
    if (!response.ok) throw new Error(data.error || "Kontrolu duplicít sa nepodarilo vykonať.");
    setCandidates(data.candidates ?? []);
    setDuplicateConfidence(data.confidence ?? "NONE");
    return data.confidence ?? "NONE";
  }

  async function submit(confirmDuplicate = false) {
    setState("sending");
    setMessage("");
    const response = await fetch("/api/partner/new-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceType, profile, confirmDuplicate }),
    });
    const data = await response.json() as { error?: string; code?: string; details?: { candidates?: Candidate[] } };
    if (!response.ok) {
      if (data.code === "DUPLICATE_CONFIRMATION_REQUIRED") {
        setCandidates(data.details?.candidates ?? []);
        setDuplicateConfidence("HIGH");
        setState("idle");
        setMessage("Našli sme profil, ktorý môže patriť vám. Skontrolujte ho pred pokračovaním.");
        return;
      }
      throw new Error(data.error || "Návrh sa nepodarilo odoslať.");
    }
    setState("success");
    setMessage("Návrh nového profilu sme prijali a čaká na kontrolu.");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending" || state === "scanning" || state === "success") return;
    try {
      const confidence = await scan();
      if (confidence === "HIGH") {
        setState("idle");
        setMessage("Našli sme profil, ktorý môže patriť vám. Skontrolujte ho pred finálnym odoslaním.");
        return;
      }
      await submit(false);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať.");
    }
  }

  async function confirmAndSubmit() {
    try { await submit(true); }
    catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať.");
    }
  }

  return (
    <form className="partner-profile-edit-form partner-new-profile-form" onSubmit={onSubmit}>
      <section className="partner-new-profile-type">
        <h2>Aký profil chcete pridať?</h2>
        <div className="partner-new-profile-type-grid">
          <label className={resourceType === "DIRECTORY_PROFILE" ? "is-selected" : undefined}>
            <input type="radio" name="resourceType" value="DIRECTORY_PROFILE" checked={resourceType === "DIRECTORY_PROFILE"}
              onChange={() => { setResourceType("DIRECTORY_PROFILE"); setCandidates([]); setDuplicateConfidence("NONE"); }} />
            <strong>Služba pre psov</strong>
            <span>Veterinár, tréner, salón, hotel, fyzioterapia a ďalšie služby.</span>
          </label>
          <label className={resourceType === "HELP_ORGANIZATION" ? "is-selected" : undefined}>
            <input type="radio" name="resourceType" value="HELP_ORGANIZATION" checked={resourceType === "HELP_ORGANIZATION"}
              onChange={() => { setResourceType("HELP_ORGANIZATION"); setCandidates([]); setDuplicateConfidence("NONE"); }} />
            <strong>Organizácia na pomoc psom</strong>
            <span>Útulok, občianske združenie, záchranná alebo nezisková organizácia.</span>
          </label>
        </div>
      </section>

      {resourceType === "DIRECTORY_PROFILE" ? (
        <div className="partner-profile-edit-grid">
          <label className="partner-field"><span>Názov</span><input required value={directory.name} onChange={(e)=>setDirectory({...directory,name:e.target.value})}/></label>
          <label className="partner-field"><span>Kategória</span><select required value={directory.category} onChange={(e)=>setDirectory({...directory,category:e.target.value})}><option value="">Vyberte kategóriu</option>{categories.map((c)=><option key={c.slug} value={c.slug}>{c.label}</option>)}</select></label>
          <label className="partner-field partner-field--wide"><span>Krátky popis</span><textarea required minLength={20} rows={3} value={directory.excerpt} onChange={(e)=>setDirectory({...directory,excerpt:e.target.value})}/></label>
          <label className="partner-field partner-field--wide"><span>Popis</span><textarea required minLength={40} rows={7} value={directory.description} onChange={(e)=>setDirectory({...directory,description:e.target.value})}/></label>
          <label className="partner-field"><span>Služby</span><textarea rows={5} value={directory.services} onChange={(e)=>setDirectory({...directory,services:e.target.value})}/><small>Jedna služba na riadok.</small></label>
          <label className="partner-field"><span>Kvalifikácie</span><textarea rows={5} value={directory.qualifications} onChange={(e)=>setDirectory({...directory,qualifications:e.target.value})}/><small>Jedna položka na riadok.</small></label>
          <label className="partner-field"><span>Mesto</span><input required value={directory.city} onChange={(e)=>setDirectory({...directory,city:e.target.value})}/></label>
          <label className="partner-field"><span>Okres</span><input value={directory.district} onChange={(e)=>setDirectory({...directory,district:e.target.value})}/></label>
          <label className="partner-field"><span>Kraj</span><input required placeholder="napr. Nitriansky kraj" value={directory.region} onChange={(e)=>setDirectory({...directory,region:e.target.value})}/></label>
          <label className="partner-field"><span>Adresa</span><input value={directory.address} onChange={(e)=>setDirectory({...directory,address:e.target.value})}/></label>
          <label className="partner-profile-check"><input type="checkbox" checked={directory.online} onChange={(e)=>setDirectory({...directory,online:e.target.checked})}/><span>Ponúkam aj online služby</span></label>
          <label className="partner-field"><span>Poznámka k cene</span><input value={directory.priceNote} onChange={(e)=>setDirectory({...directory,priceNote:e.target.value})}/></label>
          <label className="partner-field"><span>Web</span><input type="url" value={directory.websiteUrl} onChange={(e)=>setDirectory({...directory,websiteUrl:e.target.value})}/></label>
          <label className="partner-field"><span>Verejný telefón</span><input value={directory.publicPhone} onChange={(e)=>setDirectory({...directory,publicPhone:e.target.value})}/></label>
          <label className="partner-field"><span>Verejný e-mail</span><input type="email" value={directory.publicEmail} onChange={(e)=>setDirectory({...directory,publicEmail:e.target.value})}/></label>
          <label className="partner-field"><span>Facebook</span><input type="url" value={directory.facebookUrl} onChange={(e)=>setDirectory({...directory,facebookUrl:e.target.value})}/></label>
          <label className="partner-field"><span>Instagram</span><input type="url" value={directory.instagramUrl} onChange={(e)=>setDirectory({...directory,instagramUrl:e.target.value})}/></label>
        </div>
      ) : (
        <div className="partner-profile-edit-grid">
          <label className="partner-field"><span>Názov</span><input required value={organization.name} onChange={(e)=>setOrganization({...organization,name:e.target.value})}/></label>
          <label className="partner-field"><span>Typ organizácie</span><select required value={organization.type} onChange={(e)=>setOrganization({...organization,type:e.target.value})}>{partnerOrganizationTypeOptions.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
          <label className="partner-field"><span>Právny názov</span><input value={organization.legalName} onChange={(e)=>setOrganization({...organization,legalName:e.target.value})}/></label>
          <label className="partner-field"><span>Registračné číslo</span><input value={organization.registrationNumber} onChange={(e)=>setOrganization({...organization,registrationNumber:e.target.value})}/></label>
          <label className="partner-field partner-field--wide"><span>Krátky popis</span><textarea rows={3} value={organization.shortDescription} onChange={(e)=>setOrganization({...organization,shortDescription:e.target.value})}/></label>
          <label className="partner-field partner-field--wide"><span>Popis</span><textarea rows={7} value={organization.description} onChange={(e)=>setOrganization({...organization,description:e.target.value})}/></label>
          <label className="partner-field"><span>Verejný e-mail</span><input type="email" value={organization.publicEmail} onChange={(e)=>setOrganization({...organization,publicEmail:e.target.value})}/></label>
          <label className="partner-field"><span>Verejný telefón</span><input value={organization.publicPhone} onChange={(e)=>setOrganization({...organization,publicPhone:e.target.value})}/></label>
          <label className="partner-field"><span>Web</span><input type="url" value={organization.websiteUrl} onChange={(e)=>setOrganization({...organization,websiteUrl:e.target.value})}/></label>
          <label className="partner-field"><span>Facebook</span><input type="url" value={organization.facebookUrl} onChange={(e)=>setOrganization({...organization,facebookUrl:e.target.value})}/></label>
          <label className="partner-field"><span>Instagram</span><input type="url" value={organization.instagramUrl} onChange={(e)=>setOrganization({...organization,instagramUrl:e.target.value})}/></label>
          <label className="partner-field"><span>Adresa</span><input value={organization.address} onChange={(e)=>setOrganization({...organization,address:e.target.value})}/></label>
          <label className="partner-field"><span>Mesto</span><input value={organization.city} onChange={(e)=>setOrganization({...organization,city:e.target.value})}/></label>
          <label className="partner-field"><span>Okres</span><input value={organization.district} onChange={(e)=>setOrganization({...organization,district:e.target.value})}/></label>
          <label className="partner-field"><span>Kraj</span><input placeholder="napr. Trnavský kraj" value={organization.region} onChange={(e)=>setOrganization({...organization,region:e.target.value})}/></label>
          <label className="partner-field"><span>Kód krajiny</span><input maxLength={2} value={organization.countryCode} onChange={(e)=>setOrganization({...organization,countryCode:e.target.value.toUpperCase()})}/></label>
        </div>
      )}

      {candidates.length ? (
        <section className={`partner-duplicate-panel ${duplicateConfidence === "HIGH" ? "is-high" : ""}`} aria-live="polite">
          <div><span className="eyebrow">Kontrola duplicít</span><h2>{duplicateConfidence === "HIGH" ? "Našli sme profil, ktorý môže patriť vám." : "Našli sme podobný profil."}</h2></div>
          <div className="partner-duplicate-list">
            {candidates.map((candidate)=>(
              <article key={candidate.resourceType+candidate.canonicalId}>
                <div><strong>{candidate.name}</strong><span>{candidate.city || (candidate.resourceType === "HELP_ORGANIZATION" ? partnerOrganizationTypeLabel(candidate.categoryOrType) : categories.find((category) => category.slug === candidate.categoryOrType)?.label ?? candidate.categoryOrType)}</span></div>
                <p>{candidate.reasons.join(" · ")}</p>
                <div className="partner-request-links">
                  {candidate.publicHref ? <Link href={candidate.publicHref} target="_blank">Pozrieť profil ↗</Link> : null}
                  {candidate.claimHref ? <Link className="button button--dark" href={candidate.claimHref}>Spravujete tento profil?</Link> : null}
                </div>
              </article>
            ))}
          </div>
          {duplicateConfidence === "HIGH" ? (
            <button className="button" type="button" onClick={confirmAndSubmit} disabled={state === "sending"}>
              Nie je to môj profil — pokračovať
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="partner-profile-edit-submit">
        <div><strong>Profil nevznikne okamžite.</strong><p>Najprv skontrolujeme možné duplicity a návrh odošleme na moderátorskú kontrolu. Po schválení vznikne iba koncept.</p></div>
        <button className="button button--dark" type="submit" disabled={state === "scanning" || state === "sending" || state === "success" || duplicateConfidence === "HIGH"}>
          {state === "scanning" ? "Kontrolujem…" : state === "sending" ? "Odosielam…" : "Skontrolovať a odoslať"}
        </button>
      </div>
      {message ? <p className={`partner-form-message ${state === "success" ? "is-success" : state === "error" ? "is-error" : ""}`} role="status">{message}</p> : null}
    </form>
  );
}
