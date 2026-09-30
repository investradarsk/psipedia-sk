"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";
import { PartnerTurnstile } from "@/components/partner-turnstile";
import { ESHOP_RATING_FIELDS, type EshopRatingInput } from "@/lib/eshop-rating-domain";
import { reviewAuthorAuthHref } from "@/lib/review-author-return-to";
import styles from "./eshop-rating-form.module.css";

type Props = {
  eshopId: number;
  eshopName: string;
  eshopSlug: string;
  siteKey: string;
  initialRating: EshopRatingInput | null;
};

function RatingRow({ name, label, value, onChange }: { name: string; label: string; value: number | null; onChange(value: number): void }) {
  return (
    <fieldset className={styles.ratingRow}>
      <legend>{label}</legend>
      <div className={styles.options}>
        {[1,2,3,4,5].map((rating) => (
          <label key={rating} className={styles.option}>
            <input type="radio" name={name} value={rating} checked={value === rating} onChange={() => onChange(rating)} required />
            <span>{rating}<small>★</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function EshopRatingForm({ eshopId, eshopName, eshopSlug, siteKey, initialRating }: Props) {
  const [ratings, setRatings] = useState<Partial<EshopRatingInput>>(initialRating ?? {});
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  function complete() {
    return ESHOP_RATING_FIELDS.every((field) => Number.isInteger(ratings[field.key]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !complete() || !turnstileToken) return;
    setSending(true); setResult(null);
    try {
      const response = await fetch("/api/review-author/eshop-ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eshopId, ...ratings, turnstileToken }),
      });
      const data = await response.json() as { message?: string; error?: string; code?: string };
      if (response.status === 401) {
        const returnTo = `/recenzie/eshopy/${eshopSlug}/hodnotit`;
        window.location.assign(reviewAuthorAuthHref(returnTo));
        return;
      }
      if (!response.ok) throw new Error(data.error || "Hodnotenie sa nepodarilo uložiť.");
      setResult({ type: "success", text: data.message || "Ďakujeme. Hodnotenie bolo uložené." });
      setTurnstileToken("");
    } catch (error) {
      setResult({ type: "error", text: error instanceof Error ? error.message : "Hodnotenie sa nepodarilo uložiť." });
    } finally { setSending(false); }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <header>
        <span className="eyebrow">Hodnotenie e-shopu</span>
        <h1>{initialRating ? "Upraviť hodnotenie" : "Ohodnotiť"} {eshopName}</h1>
        <p>Každú oblasť ohodnoťte od 1 do 5. Text recenzie nie je potrebný.</p>
      </header>

      <div className={styles.scale}><span>1 = slabé</span><span>5 = výborné</span></div>

      <div className={styles.rows}>
        {ESHOP_RATING_FIELDS.map((field) => (
          <RatingRow
            key={field.key}
            name={"eshop-" + field.key}
            label={field.label}
            value={ratings[field.key] ?? null}
            onChange={(value) => setRatings((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
      </div>

      <div className={styles.security}>
        <PartnerTurnstile siteKey={siteKey} action="profile_review_submit" onToken={onToken} />
        <p>Hodnotenie je naviazané na overený e-mail. E-mail sa verejne nezobrazuje.</p>
      </div>

      {result ? <p className={result.type === "success" ? styles.success : styles.error} role="status">{result.text}</p> : null}

      <div className={styles.actions}>
        <button className="button button--coral" type="submit" disabled={sending || !complete() || !turnstileToken || !siteKey}>
          {sending ? "Ukladám…" : initialRating ? "Aktualizovať hodnotenie" : "Odoslať hodnotenie"}
        </button>
        <Link href={`/recenzie/eshopy/${eshopSlug}`}>Späť na profil e-shopu</Link>
      </div>
    </form>
  );
}
