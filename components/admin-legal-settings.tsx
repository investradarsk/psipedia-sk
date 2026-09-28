"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  LegalSettings,
  MediaRegistrationStatus,
  OperatorType,
  RpvsStatus,
} from "@/lib/legal-settings";

function legalReadiness(settings: LegalSettings) {
  const operator = Boolean(settings.legalName && settings.address && settings.email && settings.phone);
  const business = settings.operatorType === "individual" || Boolean(settings.ico && settings.registryName && settings.registryNumber);
  const corrections = Boolean(settings.correctionEmail);
  const media = settings.mediaStatus === "registered" && Boolean(settings.mediaRegistryNumber);
  const rpvs = settings.rpvsStatus === "registered";
  return { operator, business, corrections, media, rpvs, complete: operator && business && corrections && media && rpvs };
}

const mediaStatusLabels: Record<MediaRegistrationStatus, string> = {
  not_submitted: "Žiadosť ešte nebola podaná",
  submitted: "Žiadosť je podaná",
  registered: "Portál je zapísaný",
};

const rpvsStatusLabels: Record<RpvsStatus, string> = {
  not_registered: "Zápis ešte nie je vybavený",
  in_progress: "Zápis sa vybavuje",
  registered: "Prevádzkovateľ je zapísaný",
};

export function AdminLegalSettings({ initialSettings }: { initialSettings: LegalSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const readiness = useMemo(() => legalReadiness(settings), [settings]);

  function change<K extends keyof LegalSettings>(key: K, value: LegalSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/legal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json() as { settings?: LegalSettings; error?: string };
      if (!response.ok || !data.settings) throw new Error(data.error || "Údaje sa nepodarilo uložiť.");
      setSettings(data.settings);
      setMessage("Právne údaje sú uložené a verejná stránka je aktualizovaná.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Údaje sa nepodarilo uložiť.");
    } finally { setSaving(false); }
  }

  const checks = [
    { done: readiness.operator, label: "Prevádzkovateľ, adresa, e-mail a telefón" },
    { done: readiness.business, label: "Podnikateľské a registračné údaje" },
    { done: readiness.corrections, label: "Samostatný e-mail na opravy" },
    { done: readiness.media, label: "Evidencia spravodajského webového portálu" },
    { done: readiness.rpvs, label: "Register partnerov verejného sektora" },
  ];

  return (
    <form className="admin-legal" onSubmit={save}>
      <section className={`admin-legal-readiness ${readiness.complete ? "is-complete" : "is-incomplete"}`}>
        <div><span className="admin-eyebrow">Stav pripravenosti</span><h2>{readiness.complete ? "Právne údaje sú kompletné" : "Pred ostrou spravodajskou prevádzkou treba dokončiť tieto kroky"}</h2></div>
        <ul>{checks.map((item) => <li className={item.done ? "is-done" : ""} key={item.label}><span aria-hidden="true">{item.done ? "✓" : "!"}</span>{item.label}</li>)}</ul>
      </section>

      <div className="admin-legal-grid">
        <div>
          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>01</span><div><h2>Prevádzkovateľ</h2><p>Údaje, ktoré musia byť na webe ľahko a trvalo dostupné.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="legal-type">Typ prevádzkovateľa</label><select id="legal-type" value={settings.operatorType} onChange={(event) => change("operatorType", event.target.value as OperatorType)}><option value="individual">Fyzická osoba – nepodnikateľ</option><option value="sole_trader">Fyzická osoba – podnikateľ</option><option value="company">Právnická osoba</option></select></div>
              <div className="admin-field"><label htmlFor="legal-name">Meno alebo názov</label><input id="legal-name" value={settings.legalName} onChange={(event) => change("legalName", event.target.value)} required /></div>
              <div className="admin-field"><label htmlFor="legal-business-name">Obchodné meno <small>ak sa používa</small></label><input id="legal-business-name" value={settings.businessName} onChange={(event) => change("businessName", event.target.value)} /></div>
              <div className="admin-field"><label htmlFor="legal-address">Sídlo, miesto podnikania alebo bydlisko</label><input id="legal-address" value={settings.address} onChange={(event) => change("address", event.target.value)} placeholder="Ulica, číslo, PSČ, mesto, Slovenská republika" /></div>
              <div className="admin-field"><label htmlFor="legal-email">Verejný e-mail</label><input id="legal-email" type="email" value={settings.email} onChange={(event) => change("email", event.target.value)} placeholder="redakcia@psipedia.sk" /></div>
              <div className="admin-field"><label htmlFor="legal-phone">Telefón</label><input id="legal-phone" type="tel" value={settings.phone} onChange={(event) => change("phone", event.target.value)} placeholder="+421 …" /></div>
            </div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>02</span><div><h2>Podnikateľské údaje</h2><p>Vyplň ich, ak bude portál prevádzkovať živnostník alebo firma.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="legal-ico">IČO</label><input id="legal-ico" inputMode="numeric" value={settings.ico} onChange={(event) => change("ico", event.target.value)} /></div>
              <div className="admin-field"><label htmlFor="legal-dic">DIČ</label><input id="legal-dic" inputMode="numeric" value={settings.dic} onChange={(event) => change("dic", event.target.value)} /></div>
              <div className="admin-field"><label htmlFor="legal-vat">IČ DPH <small>ak bolo pridelené</small></label><input id="legal-vat" value={settings.vatId} onChange={(event) => change("vatId", event.target.value)} /></div>
              <div className="admin-field"><label htmlFor="legal-registry">Register</label><input id="legal-registry" value={settings.registryName} onChange={(event) => change("registryName", event.target.value)} placeholder="Živnostenský register alebo obchodný register" /></div>
              <div className="admin-field"><label htmlFor="legal-registry-number">Číslo zápisu</label><input id="legal-registry-number" value={settings.registryNumber} onChange={(event) => change("registryNumber", event.target.value)} /></div>
            </div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>03</span><div><h2>Ochrana údajov a opravy</h2><p>Na opravy musí mať spravodajský portál samostatnú viditeľnú e-mailovú adresu.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="legal-privacy-email">E-mail pre GDPR žiadosti</label><input id="legal-privacy-email" type="email" value={settings.privacyEmail} onChange={(event) => change("privacyEmail", event.target.value)} placeholder="sukromie@psipedia.sk" /></div>
              <div className="admin-field"><label htmlFor="legal-correction-email">Samostatný e-mail na opravy</label><input id="legal-correction-email" type="email" value={settings.correctionEmail} onChange={(event) => change("correctionEmail", event.target.value)} placeholder="opravy@psipedia.sk" /></div>
            </div>
          </section>
        </div>

        <aside className="admin-legal-aside">
          <section className="admin-form-card">
            <span className="admin-eyebrow">Mimo webu</span><h2>Evidencia na Ministerstve kultúry</h2><p>Pri pravidelných správach aspoň raz týždenne treba požiadať o zápis spravodajského webového portálu.</p>
            <div className="admin-field"><label htmlFor="legal-media-status">Stav žiadosti</label><select id="legal-media-status" value={settings.mediaStatus} onChange={(event) => change("mediaStatus", event.target.value as MediaRegistrationStatus)}>{Object.entries(mediaStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <div className="admin-field"><label htmlFor="legal-media-number">Evidenčné číslo</label><input id="legal-media-number" value={settings.mediaRegistryNumber} onChange={(event) => change("mediaRegistryNumber", event.target.value)} /></div>
            <a href="https://www.culture.gov.sk/sk/evidencia-periodickych-publikacii" target="_blank" rel="noreferrer">Formuláre a pokyny Ministerstva kultúry ↗</a>
          </section>

          <section className="admin-form-card">
            <span className="admin-eyebrow">Mimo webu</span><h2>Register partnerov verejného sektora</h2><p>Pre bežný komerčný spravodajský portál zákon vyžaduje zápis ešte pred začatím prevádzky. Zápis sa rieši cez oprávnenú osobu.</p>
            <div className="admin-field"><label htmlFor="legal-rpvs-status">Stav zápisu</label><select id="legal-rpvs-status" value={settings.rpvsStatus} onChange={(event) => change("rpvsStatus", event.target.value as RpvsStatus)}>{Object.entries(rpvsStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <a href="https://rpvs.gov.sk/rpvs" target="_blank" rel="noreferrer">Otvoriť register RPVS ↗</a>
          </section>

          <section className="admin-legal-note"><strong>Dôležité</strong><p>Stav „podané“ alebo „zapísané“ označ až po skutočnom vybavení. Web sám žiadosť na úrady neposiela.</p></section>
        </aside>
      </div>

      {(message || error) && <div className={`admin-editor-message ${error ? "is-error" : "is-success"}`} role="status">{error || message}</div>}
      <div className="admin-editor-actions"><div><a href="/pravne-informacie" target="_blank">Pozrieť verejnú stránku ↗</a></div><div><button className="admin-publish" type="submit" disabled={saving}>{saving ? "Ukladám…" : "Uložiť právne údaje"}</button></div></div>
    </form>
  );
}
