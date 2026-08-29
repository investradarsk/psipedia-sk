"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { DirectoryCategorySlug, DirectoryProfileEditableData } from "@/lib/directory";

type Props = {
  profile: { id: number; name: string; slug: string; category: DirectoryCategorySlug; categoryLabel: string };
  initialData: DirectoryProfileEditableData;
  specializedFields: string[];
};

export function DirectoryProfileChangeForm({ profile, initialData, specializedFields }: Props) {
  const [data, setData] = useState(initialData);
  const [servicesText, setServicesText] = useState(initialData.services.join("\n"));
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterPhone, setRequesterPhone] = useState("");
  const [requesterRole, setRequesterRole] = useState("");
  const [note, setNote] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function update<K extends keyof DirectoryProfileEditableData>(key: K, value: DirectoryProfileEditableData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setResult(null);
    try {
      const response = await fetch("/api/directory/profile-change-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          requesterName, requesterEmail, requesterPhone, requesterRole, note, authorized, consent, company,
          proposedData: { ...data, services: servicesText.split("\n").map((item) => item.trim()).filter(Boolean) },
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Návrh sa nepodarilo odoslať.");
      setResult({ type: "success", text: "Ďakujeme. Návrh úpravy sme prijali a redakcia Psipedia ho skontroluje." });
      setRequesterName(""); setRequesterEmail(""); setRequesterPhone(""); setRequesterRole(""); setNote(""); setAuthorized(false); setConsent(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setResult({ type: "error", text: error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať." });
    } finally {
      setSending(false);
    }
  }

  const textField = (label: string, key: keyof DirectoryProfileEditableData, options?: { type?: string; maxLength?: number; autoComplete?: string }) => (
    <label><span>{label}</span><input type={options?.type ?? "text"} value={String(data[key] ?? "")} onChange={(event) => update(key, event.target.value as never)} maxLength={options?.maxLength ?? 300} autoComplete={options?.autoComplete} /></label>
  );

  return (
    <form className="directory-change-form" onSubmit={submit}>
      {result && <p className={`directory-change-result is-${result.type}`} role="status">{result.text}</p>}
      <section className="directory-change-profile" aria-labelledby="change-profile-title">
        <div><span aria-hidden="true">✎</span><div><small>Upravovaný profil</small><h2 id="change-profile-title">{profile.name}</h2><p>{profile.categoryLabel}</p></div></div>
        <Link href={`/adresar/${profile.category}/${profile.slug}`}>Späť na profil</Link>
      </section>

      <section className="directory-change-section"><div className="directory-change-section-heading"><span>1</span><div><h2>Údaje profilu</h2><p>Polia sú predvyplnené verejnými údajmi. Uprav iba to, čo sa zmenilo.</p></div></div>
        <div className="directory-change-grid">
          {textField("Názov služby / firmy", "name", { maxLength: 180 })}
          {textField("Typ služby", "serviceType", { maxLength: 160 })}
          {textField("Mesto / obec", "city", { maxLength: 120 })}
          {textField("Okres", "district", { maxLength: 120 })}
          <label><span>Kraj</span><select value={data.region} onChange={(event) => update("region", event.target.value)} required>
            {["Bratislavský kraj", "Trnavský kraj", "Trenčiansky kraj", "Nitriansky kraj", "Žilinský kraj", "Banskobystrický kraj", "Prešovský kraj", "Košický kraj", "Online"].map((region) => <option value={region} key={region}>{region}</option>)}
          </select></label>
          {textField("Adresa", "address", { maxLength: 300, autoComplete: "street-address" })}
          {textField("Telefón", "phone", { type: "tel", maxLength: 50, autoComplete: "tel" })}
          {textField("E-mail", "email", { type: "email", maxLength: 180, autoComplete: "email" })}
          {textField("Web", "website", { type: "url", maxLength: 500 })}
          {textField("Facebook", "facebook", { type: "url", maxLength: 500 })}
          {textField("Instagram", "instagram", { type: "url", maxLength: 500 })}
          {textField("Orientačná cena", "priceNote", { maxLength: 1000 })}
          {textField("Lokalita / pokrytie", "coverage", { maxLength: 1000 })}
        </div>
        <label className="directory-change-wide"><span>Popis</span><textarea value={data.description} onChange={(event) => update("description", event.target.value)} rows={7} maxLength={10000} /></label>
        <label className="directory-change-wide"><span>Ponúkané služby <small>jedna služba na riadok</small></span><textarea value={servicesText} onChange={(event) => setServicesText(event.target.value)} rows={6} maxLength={4000} /></label>
        <label className="directory-change-check"><input type="checkbox" checked={data.online} onChange={(event) => update("online", event.target.checked)} /><span>Služba je dostupná aj online</span></label>
      </section>

      {specializedFields.length > 0 && <section className="directory-change-section"><div className="directory-change-section-heading"><span>2</span><div><h2>Špecializované údaje</h2><p>Doplň relevantné odborné alebo prevádzkové informácie.</p></div></div><div className="directory-change-grid">
        {specializedFields.map((label) => <label key={label}><span>{label}</span><input value={data.specialized[label] ?? ""} onChange={(event) => update("specialized", { ...data.specialized, [label]: event.target.value })} maxLength={500} /></label>)}
      </div></section>}

      <section className="directory-change-section"><div className="directory-change-section-heading"><span>{specializedFields.length > 0 ? "3" : "2"}</span><div><h2>Kontakt navrhovateľa</h2><p>Tieto údaje uvidí iba redakcia a nezobrazia sa na verejnom profile.</p></div></div>
        <div className="directory-change-grid">
          <label><span>Meno a priezvisko</span><input value={requesterName} onChange={(event) => setRequesterName(event.target.value)} autoComplete="name" minLength={2} maxLength={120} required /></label>
          <label><span>Kontaktný e-mail</span><input type="email" value={requesterEmail} onChange={(event) => setRequesterEmail(event.target.value)} autoComplete="email" maxLength={180} required /></label>
          <label><span>Telefón <small>nepovinné</small></span><input type="tel" value={requesterPhone} onChange={(event) => setRequesterPhone(event.target.value)} autoComplete="tel" maxLength={50} /></label>
          <label><span>Funkcia / vzťah k službe <small>nepovinné</small></span><select value={requesterRole} onChange={(event) => setRequesterRole(event.target.value)}><option value="">Vyberte možnosť</option><option value="majiteľ">Majiteľ</option><option value="zamestnanec">Zamestnanec</option><option value="správca webu">Správca webu</option><option value="iné">Iné</option></select></label>
        </div>
        <label className="directory-change-wide"><span>Poznámka k úprave</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} maxLength={3000} placeholder="Čo sa zmenilo, čo treba odstrániť alebo doplniť?" /></label>
        <label className="directory-honeypot" aria-hidden="true"><span>Firma</span><input value={company} onChange={(event) => setCompany(event.target.value)} tabIndex={-1} autoComplete="off" /></label>
        <div className="directory-change-consents">
          <label><input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} required /><span>Potvrdzujem, že som oprávnený/á navrhnúť úpravu údajov tohto profilu.</span></label>
          <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>Súhlasím so spracovaním uvedených osobných údajov na účely vybavenia návrhu. Viac v <Link href="/sukromie" target="_blank">zásadách ochrany osobných údajov</Link>.</span></label>
        </div>
      </section>

      <div className="directory-change-submit"><p>Návrh profil automaticky nezmení. Najprv ho manuálne skontroluje redakcia Psipedia.</p><button className="button button--primary" type="submit" disabled={sending}>{sending ? "Odosielam…" : "Odoslať návrh úpravy"}</button></div>
    </form>
  );
}
