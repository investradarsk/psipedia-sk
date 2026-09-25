"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { partnerOrganizationTypeLabel, partnerOrganizationTypeOptions } from "@/lib/partner-ui-labels";
import { PartnerMediaField } from "@/components/partner-media-field";
import { SlovakiaLocationSelector } from "@/components/slovakia-location-selector";

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
type FieldErrors = Record<string, string>;

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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+0-9() .\/-]+$/;

function validHttpUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function lineListErrors(value: string, label: string) {
  const lines = value.split("\n").map((item) => item.trim()).filter(Boolean);
  if (lines.length > 20) return `${label} môžu obsahovať najviac 20 položiek.`;
  if (lines.some((item) => item.length > 160)) return `Každá položka v poli ${label.toLowerCase()} môže mať najviac 160 znakov.`;
  return "";
}

function RequiredMark() {
  return <span className="partner-required-mark" aria-hidden="true"> *</span>;
}

export function PartnerNewProfileForm({ categories }: { categories: readonly DirectoryCategory[] }) {
  const [resourceType, setResourceType] = useState<ResourceType>("DIRECTORY_PROFILE");
  const [directory, setDirectory] = useState(emptyDirectory);
  const [organization, setOrganization] = useState(emptyOrganization);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [duplicateConfidence, setDuplicateConfidence] = useState<"NONE" | "MEDIUM" | "HIGH">("NONE");
  const [state, setState] = useState<"idle" | "scanning" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const profile = resourceType === "DIRECTORY_PROFILE"
    ? {
        ...directory,
        services: directory.services.split("\n").map((item) => item.trim()).filter(Boolean),
        qualifications: directory.qualifications.split("\n").map((item) => item.trim()).filter(Boolean),
      }
    : organization;

  function errorProps(key: string, helpId?: string) {
    const error = fieldErrors[key];
    const errorId = `partner-new-${resourceType.toLowerCase()}-${key}-error`;
    const describedBy = [helpId, error ? errorId : ""].filter(Boolean).join(" ") || undefined;
    return {
      error,
      errorId,
      input: {
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
        "data-field-error": error ? "true" : undefined,
      },
    };
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const required = (key: string, value: string, message: string) => {
      if (!value.trim()) errors[key] = message;
    };
    const max = (key: string, value: string, limit: number, label: string) => {
      if (value.length > limit) errors[key] = `${label} môže mať najviac ${limit.toLocaleString("sk-SK")} znakov.`;
    };
    const validateUrl = (key: string, value: string, label: string) => {
      max(key, value, 1200, label);
      if (!errors[key] && value.trim() && !validHttpUrl(value)) {
        errors[key] = `${label} musí byť platná adresa začínajúca http:// alebo https://.`;
      }
    };
    const validateEmail = (value: string) => {
      max("publicEmail", value, 320, "Verejný e-mail");
      if (!errors.publicEmail && value.trim() && !emailPattern.test(value.trim())) {
        errors.publicEmail = "Verejný e-mail nemá platný formát.";
      }
    };
    const validatePhone = (value: string) => {
      max("publicPhone", value, 100, "Verejný telefón");
      if (!errors.publicPhone && value.trim() && !phonePattern.test(value.trim())) {
        errors.publicPhone = "Verejný telefón nemá platný formát.";
      }
    };

    if (resourceType === "DIRECTORY_PROFILE") {
      required("name", directory.name, "Názov je povinný.");
      max("name", directory.name, 180, "Názov");
      required("category", directory.category, "Vyberte kategóriu.");
      required("excerpt", directory.excerpt, "Krátky popis je povinný.");
      if (directory.excerpt.trim() && directory.excerpt.trim().length < 20) errors.excerpt = "Krátky popis musí mať aspoň 20 znakov.";
      max("excerpt", directory.excerpt, 700, "Krátky popis");
      max("description", directory.description, 20_000, "Popis");
      const servicesError = lineListErrors(directory.services, "Služby");
      if (servicesError) errors.services = servicesError;
      const qualificationsError = lineListErrors(directory.qualifications, "Kvalifikácie");
      if (qualificationsError) errors.qualifications = qualificationsError;
      required("region", directory.region, "Vyberte kraj.");
      required("district", directory.district, "Vyberte okres.");
      required("city", directory.city, "Vyberte obec alebo mesto.");
      required("address", directory.address, "Adresa je povinná.");
      max("address", directory.address, 300, "Adresa");
      max("priceNote", directory.priceNote, 1000, "Poznámka k cene");
      validateUrl("websiteUrl", directory.websiteUrl, "Web");
      validateUrl("facebookUrl", directory.facebookUrl, "Facebook");
      validateUrl("instagramUrl", directory.instagramUrl, "Instagram");
      validateEmail(directory.publicEmail);
      validatePhone(directory.publicPhone);
      if (!directory.publicEmail.trim() && !directory.publicPhone.trim() && !directory.websiteUrl.trim()) {
        errors.contact = "Zadajte aspoň jeden verejný kontakt: e-mail, telefón alebo web.";
      }
    } else {
      required("name", organization.name, "Názov je povinný.");
      max("name", organization.name, 180, "Názov");
      required("type", organization.type, "Vyberte typ organizácie.");
      max("legalName", organization.legalName, 240, "Právny názov");
      max("registrationNumber", organization.registrationNumber, 100, "Registračné číslo");
      max("shortDescription", organization.shortDescription, 700, "Krátky popis");
      max("description", organization.description, 20_000, "Popis");
      required("countryCode", organization.countryCode, "Kód krajiny je povinný.");
      if (organization.countryCode.trim() && !/^[A-Za-z]{2}$/.test(organization.countryCode.trim())) {
        errors.countryCode = "Kód krajiny musí mať dva znaky.";
      }
      required("address", organization.address, "Adresa je povinná.");
      max("address", organization.address, 300, "Adresa");
      const isSk = organization.countryCode.trim().toUpperCase() === "SK";
      if (isSk) {
        required("region", organization.region, "Vyberte kraj.");
        required("district", organization.district, "Vyberte okres.");
        required("city", organization.city, "Vyberte obec alebo mesto.");
      } else {
        max("region", organization.region, 80, "Kraj / región");
        max("district", organization.district, 120, "Okres");
        max("city", organization.city, 120, "Mesto");
      }
      validateUrl("websiteUrl", organization.websiteUrl, "Web");
      validateUrl("facebookUrl", organization.facebookUrl, "Facebook");
      validateUrl("instagramUrl", organization.instagramUrl, "Instagram");
      validateEmail(organization.publicEmail);
      validatePhone(organization.publicPhone);
      if (!organization.publicEmail.trim() && !organization.publicPhone.trim() && !organization.websiteUrl.trim()) {
        errors.contact = "Zadajte aspoň jeden verejný kontakt: e-mail, telefón alebo web.";
      }
    }
    return errors;
  }

  function focusFirstInvalid() {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[data-field-error="true"]')?.focus();
    });
  }

  function validateBeforeRequest() {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setState("error");
      setMessage("Skontrolujte označené polia.");
      focusFirstInvalid();
      return false;
    }
    setMessage("");
    return true;
  }

  async function scan() {
    setState("scanning");
    setMessage("");
    const response = await fetch("/api/partner/new-profile/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceType, profile }),
    });
    const data = await response.json() as { error?: string; confidence?: "NONE" | "MEDIUM" | "HIGH"; candidates?: Candidate[] };
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
      body: JSON.stringify({ resourceType, profile, confirmDuplicate, mediaAssetId }),
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
    setFieldErrors({});
    setMessage("Návrh nového profilu sme prijali a čaká na kontrolu.");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending" || state === "scanning" || state === "success") return;
    if (!validateBeforeRequest()) return;
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
    if (!validateBeforeRequest()) return;
    try { await submit(true); }
    catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať.");
    }
  }

  const urlHelp = "Použite celú adresu vrátane https://";

  return (
    <form ref={formRef} className="partner-profile-edit-form partner-new-profile-form" onSubmit={onSubmit} noValidate>
      <p className="partner-required-legend">Polia označené <RequiredMark /> sú povinné.</p>
      {state === "error" && Object.keys(fieldErrors).length ? (
        <div className="partner-form-error-summary" role="alert" tabIndex={-1}>
          <strong>Skontrolujte označené polia.</strong>
        </div>
      ) : null}

      <section className="partner-new-profile-type">
        <h2>Aký profil chcete pridať?</h2>
        <div className="partner-new-profile-type-grid">
          <label className={resourceType === "DIRECTORY_PROFILE" ? "is-selected" : undefined}>
            <input type="radio" name="resourceType" value="DIRECTORY_PROFILE" checked={resourceType === "DIRECTORY_PROFILE"}
              onChange={() => { setResourceType("DIRECTORY_PROFILE"); setCandidates([]); setDuplicateConfidence("NONE"); setFieldErrors({}); setMessage(""); }} />
            <strong>Služba pre psov</strong>
            <span>Veterinár, tréner, salón, hotel, fyzioterapia a ďalšie služby.</span>
          </label>
          <label className={resourceType === "HELP_ORGANIZATION" ? "is-selected" : undefined}>
            <input type="radio" name="resourceType" value="HELP_ORGANIZATION" checked={resourceType === "HELP_ORGANIZATION"}
              onChange={() => { setResourceType("HELP_ORGANIZATION"); setCandidates([]); setDuplicateConfidence("NONE"); setFieldErrors({}); setMessage(""); }} />
            <strong>Organizácia na pomoc psom</strong>
            <span>Útulok, občianske združenie, záchranná alebo nezisková organizácia.</span>
          </label>
        </div>
      </section>

      {resourceType === "DIRECTORY_PROFILE" ? (
        <div className="partner-profile-edit-grid">
          {(() => { const p = errorProps("name"); return <label className="partner-field"><span>Názov<RequiredMark /></span><input {...p.input} required maxLength={180} value={directory.name} onChange={(e)=>setDirectory({...directory,name:e.target.value})}/>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          {(() => { const p = errorProps("category"); return <label className="partner-field"><span>Kategória<RequiredMark /></span><select {...p.input} required value={directory.category} onChange={(e)=>setDirectory({...directory,category:e.target.value})}><option value="">Vyberte kategóriu</option>{categories.map((cat)=><option key={cat.slug} value={cat.slug}>{cat.label}</option>)}</select>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          {(() => { const p = errorProps("excerpt","partner-directory-excerpt-help"); return <label className="partner-field partner-field--wide"><span>Krátky popis<RequiredMark /></span><textarea {...p.input} required minLength={20} maxLength={700} rows={3} value={directory.excerpt} onChange={(e)=>setDirectory({...directory,excerpt:e.target.value})}/><span className="partner-character-meta" id="partner-directory-excerpt-help"><small>20–700 znakov</small><small className="partner-character-counter" aria-live="polite">{directory.excerpt.length} / 700</small></span>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          {(() => { const p = errorProps("description","partner-directory-description-help"); return <label className="partner-field partner-field--wide"><span>Popis</span><textarea {...p.input} maxLength={20_000} rows={7} value={directory.description} onChange={(e)=>setDirectory({...directory,description:e.target.value})}/><span className="partner-character-meta" id="partner-directory-description-help"><small>Max. 20 000 znakov</small><small className="partner-character-counter" aria-live="polite">{directory.description.length.toLocaleString("sk-SK")} / 20 000</small></span>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          {(() => { const p = errorProps("services"); return <label className="partner-field"><span>Služby</span><textarea {...p.input} rows={5} value={directory.services} onChange={(e)=>setDirectory({...directory,services:e.target.value})}/><small>Jedna služba na riadok. Max. 20 položiek, každá max. 160 znakov.</small>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          {(() => { const p = errorProps("qualifications"); return <label className="partner-field"><span>Kvalifikácie</span><textarea {...p.input} rows={5} value={directory.qualifications} onChange={(e)=>setDirectory({...directory,qualifications:e.target.value})}/><small>Jedna položka na riadok. Max. 20 položiek, každá max. 160 znakov.</small>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          <SlovakiaLocationSelector value={{ region: directory.region, district: directory.district, city: directory.city }}
            onChange={(location) => setDirectory((current) => ({ ...current, ...location }))} required
            errors={{region:fieldErrors.region,district:fieldErrors.district,city:fieldErrors.city}}
            idPrefix="partner-new-directory-location" />
          {(() => { const p = errorProps("address"); return <label className="partner-field"><span>Adresa<RequiredMark /></span><input {...p.input} required maxLength={300} placeholder="Bernolákova 12" value={directory.address} onChange={(e)=>setDirectory({...directory,address:e.target.value})}/>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          <label className="partner-profile-check"><input type="checkbox" checked={directory.online} onChange={(e)=>setDirectory({...directory,online:e.target.checked})}/><span>Ponúkam aj online služby</span></label>
          {(() => { const p = errorProps("priceNote"); return <label className="partner-field"><span>Poznámka k cene</span><input {...p.input} maxLength={1000} value={directory.priceNote} onChange={(e)=>setDirectory({...directory,priceNote:e.target.value})}/>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          <fieldset className="partner-contact-group partner-field--wide" aria-describedby="partner-directory-contact-help">
            <legend>Kontakt<RequiredMark /></legend>
            <p id="partner-directory-contact-help">Vyplňte aspoň jeden: e-mail, telefón alebo web.</p>
            {fieldErrors.contact ? <p className="partner-field-error" id="partner-directory-contact-error">{fieldErrors.contact}</p> : null}
            <div className="partner-contact-grid">
              {(() => { const p = errorProps("publicEmail", fieldErrors.contact ? "partner-directory-contact-error" : undefined); return <label className="partner-field"><span>Verejný e-mail</span><input {...p.input} type="email" maxLength={320} value={directory.publicEmail} onChange={(e)=>setDirectory({...directory,publicEmail:e.target.value})}/>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
              {(() => { const p = errorProps("publicPhone", fieldErrors.contact ? "partner-directory-contact-error" : undefined); return <label className="partner-field"><span>Verejný telefón</span><input {...p.input} maxLength={100} value={directory.publicPhone} onChange={(e)=>setDirectory({...directory,publicPhone:e.target.value})}/>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
              {(() => { const p = errorProps("websiteUrl", fieldErrors.contact ? "partner-directory-contact-error" : "partner-directory-web-help"); return <label className="partner-field"><span>Web</span><input {...p.input} type="url" maxLength={1200} placeholder="https://www.example.sk" value={directory.websiteUrl} onChange={(e)=>setDirectory({...directory,websiteUrl:e.target.value})}/><small id="partner-directory-web-help">{urlHelp}</small>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
            </div>
          </fieldset>
          {(() => { const p = errorProps("facebookUrl","partner-directory-facebook-help"); return <label className="partner-field"><span>Facebook</span><input {...p.input} type="url" maxLength={1200} placeholder="https://www.facebook.com/..." value={directory.facebookUrl} onChange={(e)=>setDirectory({...directory,facebookUrl:e.target.value})}/><small id="partner-directory-facebook-help">{urlHelp}</small>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
          {(() => { const p = errorProps("instagramUrl","partner-directory-instagram-help"); return <label className="partner-field"><span>Instagram</span><input {...p.input} type="url" maxLength={1200} placeholder="https://www.instagram.com/..." value={directory.instagramUrl} onChange={(e)=>setDirectory({...directory,instagramUrl:e.target.value})}/><small id="partner-directory-instagram-help">{urlHelp}</small>{p.error ? <small className="partner-field-error" id={p.errorId}>{p.error}</small> : null}</label>; })()}
        </div>
      ) : (
        <div className="partner-profile-edit-grid">
          {(() => { const p=errorProps("name"); return <label className="partner-field"><span>Názov<RequiredMark /></span><input {...p.input} required maxLength={180} value={organization.name} onChange={(e)=>setOrganization({...organization,name:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {(() => { const p=errorProps("type"); return <label className="partner-field"><span>Typ organizácie<RequiredMark /></span><select {...p.input} required value={organization.type} onChange={(e)=>setOrganization({...organization,type:e.target.value})}>{partnerOrganizationTypeOptions.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {(() => { const p=errorProps("legalName"); return <label className="partner-field"><span>Právny názov</span><input {...p.input} maxLength={240} value={organization.legalName} onChange={(e)=>setOrganization({...organization,legalName:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {(() => { const p=errorProps("registrationNumber"); return <label className="partner-field"><span>Registračné číslo</span><input {...p.input} maxLength={100} value={organization.registrationNumber} onChange={(e)=>setOrganization({...organization,registrationNumber:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {(() => { const p=errorProps("shortDescription","partner-organization-short-help"); return <label className="partner-field partner-field--wide"><span>Krátky popis</span><textarea {...p.input} maxLength={700} rows={3} value={organization.shortDescription} onChange={(e)=>setOrganization({...organization,shortDescription:e.target.value})}/><span className="partner-character-meta" id="partner-organization-short-help"><small>Max. 700 znakov</small><small className="partner-character-counter" aria-live="polite">{organization.shortDescription.length} / 700</small></span>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {(() => { const p=errorProps("description","partner-organization-description-help"); return <label className="partner-field partner-field--wide"><span>Popis</span><textarea {...p.input} maxLength={20_000} rows={7} value={organization.description} onChange={(e)=>setOrganization({...organization,description:e.target.value})}/><span className="partner-character-meta" id="partner-organization-description-help"><small>Max. 20 000 znakov</small><small className="partner-character-counter" aria-live="polite">{organization.description.length.toLocaleString("sk-SK")} / 20 000</small></span>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {(() => { const p=errorProps("countryCode"); return <label className="partner-field"><span>Kód krajiny<RequiredMark /></span><input {...p.input} required maxLength={2} value={organization.countryCode} onChange={(e)=>setOrganization((current)=>{const countryCode=e.target.value.toUpperCase();return {...current,countryCode,...(countryCode==="SK"&&current.countryCode!=="SK"?{city:"",district:"",region:""}:{})};})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {(() => { const p=errorProps("address"); return <label className="partner-field"><span>Adresa<RequiredMark /></span><input {...p.input} required maxLength={300} placeholder="Bernolákova 12" value={organization.address} onChange={(e)=>setOrganization({...organization,address:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {organization.countryCode.trim().toUpperCase() === "SK" ? (
            <SlovakiaLocationSelector value={{region:organization.region,district:organization.district,city:organization.city}}
              onChange={(location)=>setOrganization((current)=>({...current,...location}))} required
              errors={{region:fieldErrors.region,district:fieldErrors.district,city:fieldErrors.city}}
              idPrefix="partner-new-organization-location" />
          ) : (
            <>
              {(() => { const p=errorProps("city"); return <label className="partner-field"><span>Mesto</span><input {...p.input} maxLength={120} value={organization.city} onChange={(e)=>setOrganization({...organization,city:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
              {(() => { const p=errorProps("district"); return <label className="partner-field"><span>Okres</span><input {...p.input} maxLength={120} value={organization.district} onChange={(e)=>setOrganization({...organization,district:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
              {(() => { const p=errorProps("region"); return <label className="partner-field"><span>Kraj / región</span><input {...p.input} maxLength={80} value={organization.region} onChange={(e)=>setOrganization({...organization,region:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
            </>
          )}
          <fieldset className="partner-contact-group partner-field--wide" aria-describedby="partner-organization-contact-help">
            <legend>Kontakt<RequiredMark /></legend>
            <p id="partner-organization-contact-help">Vyplňte aspoň jeden: e-mail, telefón alebo web.</p>
            {fieldErrors.contact ? <p className="partner-field-error" id="partner-organization-contact-error">{fieldErrors.contact}</p> : null}
            <div className="partner-contact-grid">
              {(() => { const p=errorProps("publicEmail",fieldErrors.contact?"partner-organization-contact-error":undefined); return <label className="partner-field"><span>Verejný e-mail</span><input {...p.input} type="email" maxLength={320} value={organization.publicEmail} onChange={(e)=>setOrganization({...organization,publicEmail:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
              {(() => { const p=errorProps("publicPhone",fieldErrors.contact?"partner-organization-contact-error":undefined); return <label className="partner-field"><span>Verejný telefón</span><input {...p.input} maxLength={100} value={organization.publicPhone} onChange={(e)=>setOrganization({...organization,publicPhone:e.target.value})}/>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
              {(() => { const p=errorProps("websiteUrl",fieldErrors.contact?"partner-organization-contact-error":"partner-organization-web-help"); return <label className="partner-field"><span>Web</span><input {...p.input} type="url" maxLength={1200} placeholder="https://www.example.sk" value={organization.websiteUrl} onChange={(e)=>setOrganization({...organization,websiteUrl:e.target.value})}/><small id="partner-organization-web-help">{urlHelp}</small>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
            </div>
          </fieldset>
          {(() => { const p=errorProps("facebookUrl","partner-organization-facebook-help"); return <label className="partner-field"><span>Facebook</span><input {...p.input} type="url" maxLength={1200} value={organization.facebookUrl} onChange={(e)=>setOrganization({...organization,facebookUrl:e.target.value})}/><small id="partner-organization-facebook-help">{urlHelp}</small>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
          {(() => { const p=errorProps("instagramUrl","partner-organization-instagram-help"); return <label className="partner-field"><span>Instagram</span><input {...p.input} type="url" maxLength={1200} value={organization.instagramUrl} onChange={(e)=>setOrganization({...organization,instagramUrl:e.target.value})}/><small id="partner-organization-instagram-help">{urlHelp}</small>{p.error?<small className="partner-field-error" id={p.errorId}>{p.error}</small>:null}</label>; })()}
        </div>
      )}

      <PartnerMediaField label="Logo alebo hlavná fotografia" intent="PARTNER_PROFILE_CREATE" onChange={setMediaAssetId} disabled={state==="success"}/>

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
