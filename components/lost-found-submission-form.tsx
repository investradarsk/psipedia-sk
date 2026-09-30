"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PartnerTurnstile } from "@/components/partner-turnstile";
import { LOST_FOUND_TURNSTILE_ACTION } from "@/lib/lost-found-public-constants";
import styles from "./lost-found-submission-form.module.css";

type ApiResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  code?: string;
  field?: string | null;
};

const regions = [
  "Bratislavský kraj",
  "Trnavský kraj",
  "Trenčiansky kraj",
  "Nitriansky kraj",
  "Žilinský kraj",
  "Banskobystrický kraj",
  "Prešovský kraj",
  "Košický kraj",
];

export function LostFoundSubmissionForm({ siteKey }: { siteKey: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const [type, setType] = useState<"LOST" | "FOUND">("LOST");
  const [clientReady, setClientReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);
  const setResultNode = useCallback((node: HTMLElement | null) => {
    resultRef.current = node;
  }, []);

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [result]);

  function resetTurnstile() {
    setTurnstileToken("");
    setTurnstileAttempt((attempt) => attempt + 1);
  }

  function focusField(name: string | null | undefined) {
    if (!name) return;
    const element = formRef.current?.elements.namedItem(name);
    if (element instanceof HTMLElement) element.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientReady || sending) return;
    const form = formRef.current;
    if (!form?.checkValidity()) {
      form?.reportValidity();
      return;
    }
    if (!turnstileToken) {
      setFieldError("turnstileToken");
      setResult({ type: "error", text: "Dokončite bezpečnostné overenie." });
      document.getElementById("lost-found-turnstile")?.focus();
      return;
    }

    setSending(true);
    setFieldError(null);
    setResult(null);
    try {
      const body = new FormData(form);
      body.set("turnstileToken", turnstileToken);
      const response = await fetch("/api/lost-found/submissions", { method: "POST", body });
      const data = await response.json() as ApiResponse;
      if (!response.ok) {
        setFieldError(data.field ?? null);
        setResult({ type: "error", text: data.error || "Hlásenie sa nepodarilo odoslať." });
        resetTurnstile();
        return;
      }
      setResult({
        type: "success",
        text: data.message || "Ďakujeme. Hlásenie sme prijali na kontrolu.",
      });
    } catch {
      setResult({ type: "error", text: "Hlásenie sa momentálne nepodarilo odoslať. Skúste to znova." });
      resetTurnstile();
    } finally {
      setSending(false);
    }
  }

  if (result?.type === "success") {
    return (
      <section ref={setResultNode} tabIndex={-1} className={[styles.confirmation, styles.shell].join(" ")} aria-live="polite">
        <span className="eyebrow">Pomoc psom</span>
        <h1>Hlásenie sme prijali</h1>
        <p>{result.text}</p>
        <p>Kontaktné údaje zostávajú súkromné. Ak hlásenie schválime, verejne zobrazíme iba údaje o psovi a približnej lokalite.</p>
        <div className={styles.actions}>
          <Link className="button button--dark" href="/pomoc-psom/stratene-a-najdene">Späť na hlásenia</Link>
        </div>
      </section>
    );
  }

  return (
    <form
      ref={formRef}
      className={[styles.form, styles.shell].join(" ")}
      method="post"
      action="/api/lost-found/submissions"
      onSubmit={submit}
      encType="multipart/form-data"
      aria-busy={sending}
    >
      <header className={styles.header}>
        <span className="eyebrow">Pomoc psom</span>
        <h1>Nahlásiť strateného alebo nájdeného psa</h1>
        <p>Hlásenie pred zverejnením skontrolujeme. Telefón a e-mail sa verejne nezobrazia.</p>
      </header>

      {result?.type === "error" ? <p ref={setResultNode} tabIndex={-1} className={styles.error} role="alert">{result.text}</p> : null}

      <noscript>
        <p className={styles.error} role="alert">
          Na bezpečné odoslanie hlásenia je potrebný JavaScript. Údaje neboli odoslané. Zapnite JavaScript a stránku obnovte.
        </p>
      </noscript>

      <fieldset className={styles.card}>
        <legend>1. Čo sa stalo</legend>
        <div className={styles.twoColumns}>
          <label>
            <span>Typ hlásenia *</span>
            <select name="type" value={type} onChange={(event) => setType(event.target.value as "LOST" | "FOUND")} required>
              <option value="LOST">Stratený pes</option>
              <option value="FOUND">Nájdený pes</option>
            </select>
          </label>
          <label>
            <span>Dátum udalosti *</span>
            <input type="date" name="eventDate" required aria-invalid={fieldError === "eventDate" || undefined} />
          </label>
          {type === "LOST" ? (
            <label>
              <span>Naposledy videný *</span>
              <input type="datetime-local" name="lastSeenDateTime" required aria-invalid={fieldError === "lastSeenDateTime" || undefined} />
            </label>
          ) : null}
        </div>
      </fieldset>

      <fieldset className={styles.card}>
        <legend>2. Pes</legend>
        <div className={styles.twoColumns}>
          <label><span>Meno, ak je známe</span><input name="dogName" maxLength={120} /></label>
          <label>
            <span>Pohlavie</span>
            <select name="sex" defaultValue="UNKNOWN">
              <option value="UNKNOWN">Neznáme</option><option value="MALE">Pes</option><option value="FEMALE">Sučka</option>
            </select>
          </label>
          <label>
            <span>Veľkosť</span>
            <select name="size" defaultValue="UNKNOWN">
              <option value="UNKNOWN">Neznáma</option><option value="SMALL">Malý</option><option value="MEDIUM">Stredný</option><option value="LARGE">Veľký</option>
            </select>
          </label>
          <label>
            <span>Čip</span>
            <select name="chipped" defaultValue="UNKNOWN">
              <option value="UNKNOWN">Neviem</option><option value="YES">Áno</option><option value="NO">Nie</option>
            </select>
          </label>
          <label><span>Plemeno, ak je známe</span><input name="breed" maxLength={160} /></label>
          <label className={styles.checkbox}><input type="checkbox" name="breedUnknown" value="1" /> Plemeno nepoznám</label>
          <label><span>Farba</span><input name="color" maxLength={160} /></label>
          <label><span>Približný vek</span><input name="approximateAge" maxLength={120} placeholder="napr. 3–5 rokov" /></label>
        </div>
        <label>
          <span>Popis *</span>
          <textarea name="description" minLength={20} maxLength={3000} rows={7} required aria-invalid={fieldError === "description" || undefined} />
          <small>Uveďte vzhľad a okolnosti. Telefón ani e-mail sem nepíšte.</small>
        </label>
        <label><span>Rozpoznávacie znaky</span><textarea name="distinguishingMarks" maxLength={800} rows={3} /></label>
        <label><span>Obojok alebo postroj</span><textarea name="collarDescription" maxLength={500} rows={2} /></label>
        <label>
          <span>Fotografia</span>
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" aria-describedby="lost-found-image-help" />
          <small id="lost-found-image-help">Nepovinné. JPG, PNG alebo WebP, najviac 8 MB. Fotografia sa pred schválením drží v súkromnom úložisku.</small>
        </label>
      </fieldset>

      <fieldset className={styles.card}>
        <legend>3. Približná lokalita</legend>
        <p className={styles.help}>Nezadávajte domácu adresu ani presné súradnice.</p>
        <div className={styles.twoColumns}>
          <label>
            <span>Kraj *</span>
            <select name="region" required defaultValue="">
              <option value="" disabled>Vyberte kraj</option>
              {regions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </label>
          <label><span>Obec alebo mesto *</span><input name="city" maxLength={120} required aria-invalid={fieldError === "city" || undefined} /></label>
          <label><span>Okres</span><input name="district" maxLength={120} /></label>
        </div>
        <label>
          <span>Približné miesto</span>
          <textarea name="locationDescription" maxLength={700} rows={3} placeholder="napr. okolie parku pri centre obce" />
        </label>
      </fieldset>

      <fieldset className={styles.card}>
        <legend>4. Súkromný kontakt</legend>
        <p className={styles.help}>Tieto údaje vidí iba administrácia. Verejne sa automaticky nezobrazia.</p>
        <div className={styles.twoColumns}>
          <label><span>Meno kontaktnej osoby</span><input name="contactName" maxLength={160} autoComplete="name" /></label>
          <label><span>Telefón</span><input name="contactPhone" maxLength={80} inputMode="tel" autoComplete="tel" aria-invalid={fieldError === "contactPhone" || undefined} /></label>
          <label><span>E-mail</span><input type="email" name="contactEmail" maxLength={254} autoComplete="email" aria-invalid={fieldError === "contactEmail" || undefined} /></label>
        </div>
        <p className={styles.help}>Vyplňte aspoň telefón alebo e-mail.</p>
      </fieldset>

      <div className={styles.honeypot} aria-hidden="true">
        <label>Webová stránka<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div id="lost-found-turnstile" className={styles.turnstile} tabIndex={-1} aria-invalid={fieldError === "turnstileToken" || undefined}>
        <PartnerTurnstile key={turnstileAttempt} siteKey={siteKey} action={LOST_FOUND_TURNSTILE_ACTION} onToken={onToken} />
      </div>

      <div className={styles.actions}>
        <Link className={styles.secondary} href="/pomoc-psom/stratene-a-najdene">Zrušiť</Link>
        <button className="button button--dark" type="submit" disabled={!clientReady || sending}>{sending ? "Odosielam…" : clientReady ? "Odoslať hlásenie" : "Pripravujem formulár…"}</button>
      </div>
    </form>
  );
}
