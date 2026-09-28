"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { newsTipTopicOptions } from "@/lib/news-tip";

export function NewsTipForm() {
  const [topic, setTopic] = useState<string>(newsTipTopicOptions[0].slug);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [company, setCompany] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/news-tips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, title, summary, sourceUrl, location, eventDate, contactName, contactEmail, company, consent }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Tip sa nepodarilo odoslať.");
      setResult({ type: "success", text: "Ďakujeme. Tip je bezpečne uložený v redakcii. Pred prípadným zverejnením ho overíme z nezávislých zdrojov." });
      setTopic(newsTipTopicOptions[0].slug);
      setTitle(""); setSummary(""); setSourceUrl(""); setLocation(""); setEventDate("");
      setContactName(""); setContactEmail(""); setConsent(false);
    } catch (error) {
      setResult({ type: "error", text: error instanceof Error ? error.message : "Tip sa nepodarilo odoslať." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="news-tip-form" onSubmit={submit}>
      <div className="news-tip-form-heading">
        <span aria-hidden="true">💡</span>
        <div><span className="eyebrow">Tip pre redakciu</span><h2>Čo by sme mali preveriť?</h2><p>Nemusíš písať hotový článok. Stačí jasne opísať, čo sa stalo a kde sa o tom môžeme dozvedieť viac.</p></div>
      </div>

      <div className="news-tip-form-grid">
        <label>
          <span>Téma</span>
          <select value={topic} onChange={(event) => setTopic(event.target.value)} required>
            {newsTipTopicOptions.map((option) => <option value={option.slug} key={option.slug}>{option.icon} {option.label}</option>)}
          </select>
        </label>
        <label>
          <span>Krátky názov tipu</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={8} maxLength={160} placeholder="Napr. Záchranársky pes našiel človeka po zosuve" required />
        </label>
        <label>
          <span>Miesto <small>nepovinné</small></span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={140} placeholder="Mesto, okres alebo krajina" />
        </label>
        <label>
          <span>Dátum udalosti <small>nepovinné</small></span>
          <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
        </label>
      </div>

      <label className="news-tip-form-message">
        <span>Čo sa stalo?</span>
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={7} minLength={30} maxLength={4000} placeholder="Napíš, čo vieš, kto je zapojený a prečo je príbeh dôležitý. Ak si niečím nie si istý, pokojne to uveď." required />
        <small>{summary.length} / 4 000 znakov</small>
      </label>

      <label className="news-tip-form-source">
        <span>Odkaz na zdroj <small>nepovinné, ale veľmi pomôže</small></span>
        <input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={2000} placeholder="https://..." inputMode="url" />
      </label>

      <div className="news-tip-contact-box">
        <div><strong>Môžeme sa ozvať?</strong><p>Kontakt je nepovinný. Použijeme ho iba vtedy, ak budeme potrebovať doplniť informácie k tomuto tipu.</p></div>
        <div className="news-tip-form-grid">
          <label><span>Meno <small>nepovinné</small></span><input value={contactName} onChange={(event) => setContactName(event.target.value)} autoComplete="name" maxLength={100} /></label>
          <label><span>E-mail <small>nepovinné</small></span><input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} autoComplete="email" maxLength={180} /></label>
        </div>
      </div>

      <p className="form-privacy-hint">Neposielaj čísla dokladov, zdravotnú dokumentáciu ľudí, súkromnú korešpondenciu ani fotografie osôb bez oprávnenia. Pri urgente kontaktuj políciu, obec alebo veterinárnu pomoc.</p>
      <label className="directory-honeypot" aria-hidden="true"><span>Firma</span><input value={company} onChange={(event) => setCompany(event.target.value)} tabIndex={-1} autoComplete="off" /></label>
      <label className="news-tip-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>Potvrdzujem, že som sa oboznámil/a so spracúvaním údajov na preverenie tipu. Rozumiem, že odoslanie neznamená automatické zverejnenie. Viac v <Link href="/sukromie" target="_blank">zásadách ochrany osobných údajov</Link>.</span></label>
      {result && <p className={`news-tip-result is-${result.type}`} role="status">{result.text}</p>}
      <button className="button button--coral news-tip-submit" type="submit" disabled={sending}>{sending ? "Odosielam…" : "Odoslať tip redakcii"}</button>
    </form>
  );
}
