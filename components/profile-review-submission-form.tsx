"use client";

import Link from "next/link";
import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { PartnerTurnstile } from "@/components/partner-turnstile";
import { reviewAuthorAuthHref } from "@/lib/review-author-return-to";
import styles from "./profile-review-submission-form.module.css";

type Dimension = {
  key: string;
  label: string;
  required: boolean;
};

type Props = {
  resourceId: string;
  profileName: string;
  profileHref: string;
  schemaVersion: number;
  dimensions: readonly Dimension[];
  siteKey: string;
};

type ApiResponse = {
  success?: boolean;
  reviewId?: string;
  status?: string;
  profileHref?: string;
  message?: string;
  error?: string;
  code?: string;
  field?: string | null;
};

function RatingOptions({
  name,
  value,
  onChange,
  required = false,
  describedBy,
}: {
  name: string;
  value: number | null;
  onChange(value: number): void;
  required?: boolean;
  describedBy?: string;
}) {
  return (
    <div className={styles.ratingOptions}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <label key={rating} className={styles.ratingOption}>
          <input
            type="radio"
            name={name}
            value={rating}
            checked={value === rating}
            onChange={() => onChange(rating)}
            required={required}
            aria-describedby={describedBy}
          />
          <span aria-hidden="true">{rating} ★</span>
          <span className={styles.srOnly}>{rating} z 5</span>
        </label>
      ))}
    </div>
  );
}

export function ProfileReviewSubmissionForm({
  resourceId,
  profileName,
  profileHref,
  schemaVersion,
  dimensions,
  siteKey,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [dimensionValues, setDimensionValues] = useState<Record<string, number>>({});
  const [body, setBody] = useState("");
  const [serviceMonth, setServiceMonth] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error" | "already"; text: string; profileHref?: string } | null>(null);
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  const bodyHelp = useMemo(() => (
    fieldError === "body" ? "review-body-help review-body-error" : "review-body-help"
  ), [fieldError]);

  function focusField(field: string | null | undefined) {
    if (!field) return;
    const map: Record<string, string> = {
      overallRating: "review-overall-rating-1",
      body: "review-body",
      serviceMonth: "review-service-month",
      dimensions: "review-dimensions",
      turnstileToken: "review-turnstile",
    };
    const id = map[field];
    if (id) document.getElementById(id)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    const form = formRef.current;
    if (!form?.checkValidity()) {
      form?.reportValidity();
      return;
    }
    if (!overallRating) {
      setFieldError("overallRating");
      document.getElementById("review-overall-rating-1")?.focus();
      return;
    }
    if (!turnstileToken) {
      setFieldError("turnstileToken");
      setResult({ type: "error", text: "Dokončite bezpečnostné overenie." });
      document.getElementById("review-turnstile")?.focus();
      return;
    }

    setSending(true);
    setResult(null);
    setFieldError(null);

    try {
      const response = await fetch("/api/review-author/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId,
          overallRating,
          body,
          serviceMonth,
          ratingSchemaVersion: schemaVersion,
          dimensions: dimensions
            .filter((dimension) => dimensionValues[dimension.key])
            .map((dimension) => ({ key: dimension.key, value: dimensionValues[dimension.key] })),
          turnstileToken,
        }),
      });
      const data = await response.json() as ApiResponse;

      if (response.status === 401) {
        const returnTo = window.location.pathname + window.location.search;
        window.location.assign(reviewAuthorAuthHref(returnTo));
        return;
      }

      if (!response.ok) {
        const type = data.code === "ALREADY_REVIEWED" ? "already" : "error";
        setResult({ type, text: data.error || "Recenziu sa nepodarilo odoslať." });
        setFieldError(data.field ?? null);
        queueMicrotask(() => focusField(data.field));
        return;
      }

      setResult({
        type: "success",
        text: data.message || "Ďakujeme za recenziu. Po kontrole ju môžeme zverejniť na profile.",
        profileHref: data.profileHref || profileHref,
      });
    } catch {
      setResult({ type: "error", text: "Recenziu sa momentálne nepodarilo odoslať." });
    } finally {
      setSending(false);
    }
  }

  if (result?.type === "success") {
    return (
      <section className={styles.confirmation} aria-live="polite">
        <span className="eyebrow">Recenzie Psipedia</span>
        <h1>Ďakujeme za recenziu</h1>
        <p>{result.text}</p>
        <p className={styles.pendingNote}>Recenzia zatiaľ nie je verejná a čaká na kontrolu.</p>
        <Link className="button button--dark" href={result.profileHref || profileHref}>
          Späť na profil
        </Link>
      </section>
    );
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate={false}>
      <header className={styles.header}>
        <span className="eyebrow">Recenzie Psipedia</span>
        <h1>Napísať recenziu</h1>
        <p>Hodnotíte <strong>{profileName}</strong>. Recenziu pred zverejnením skontrolujeme.</p>
      </header>

      <fieldset className={styles.fieldset} aria-describedby={fieldError === "overallRating" ? "review-overall-error" : undefined}>
        <legend>Celkové hodnotenie <span aria-hidden="true">*</span></legend>
        <p className={styles.help}>Vyberte 1 až 5.</p>
        <RatingOptions
          name="overallRating"
          value={overallRating}
          onChange={(value) => {
            setOverallRating(value);
            if (fieldError === "overallRating") setFieldError(null);
          }}
          required
          describedBy={fieldError === "overallRating" ? "review-overall-error" : undefined}
        />
        {fieldError === "overallRating" ? (
          <p id="review-overall-error" className={styles.fieldError}>Vyberte celkové hodnotenie od 1 do 5.</p>
        ) : null}
      </fieldset>

      {dimensions.length ? (
        <section className={styles.dimensionSection} id="review-dimensions" tabIndex={-1}>
          <h2>Doplnkové hodnotenia</h2>
          <p className={styles.help}>Nepovinné. Pomáhajú lepšie opísať vašu skúsenosť.</p>
          {dimensions.map((dimension) => (
            <fieldset className={styles.fieldset} key={dimension.key}>
              <legend>{dimension.label}{dimension.required ? " *" : ""}</legend>
              <RatingOptions
                name={"dimension-" + dimension.key}
                value={dimensionValues[dimension.key] ?? null}
                onChange={(value) => setDimensionValues((current) => ({ ...current, [dimension.key]: value }))}
                required={dimension.required}
              />
            </fieldset>
          ))}
          {fieldError === "dimensions" ? (
            <p className={styles.fieldError}>Doplnkové hodnotenia nie sú platné. Obnovte formulár a skúste to znova.</p>
          ) : null}
        </section>
      ) : null}

      <label className={styles.field} htmlFor="review-body">
        <span>Text recenzie <span aria-hidden="true">*</span></span>
        <textarea
          id="review-body"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            if (fieldError === "body") setFieldError(null);
          }}
          minLength={20}
          maxLength={5000}
          rows={8}
          required
          aria-describedby={bodyHelp}
          aria-invalid={fieldError === "body" ? true : undefined}
        />
      </label>
      <div className={styles.helpRow}>
        <p id="review-body-help" className={styles.help}>20 až 5 000 znakov. Nepoužívajte HTML.</p>
        <span aria-live="polite">{body.length} / 5000</span>
      </div>
      {fieldError === "body" ? (
        <p id="review-body-error" className={styles.fieldError}>Skontrolujte text recenzie.</p>
      ) : null}

      <label className={styles.field} htmlFor="review-service-month">
        <span>Mesiac využitia služby <small>Nepovinné</small></span>
        <input
          id="review-service-month"
          type="month"
          value={serviceMonth}
          onChange={(event) => {
            setServiceMonth(event.target.value);
            if (fieldError === "serviceMonth") setFieldError(null);
          }}
          aria-invalid={fieldError === "serviceMonth" ? true : undefined}
          aria-describedby={fieldError === "serviceMonth" ? "review-service-month-error" : "review-service-month-help"}
        />
      </label>
      <p id="review-service-month-help" className={styles.help}>Ukladáme iba mesiac a rok, nie presný dátum návštevy.</p>
      {fieldError === "serviceMonth" ? (
        <p id="review-service-month-error" className={styles.fieldError}>Mesiac služby nie je platný.</p>
      ) : null}

      <div id="review-turnstile" tabIndex={-1}>
        <PartnerTurnstile
          siteKey={siteKey}
          action="profile_review_submit"
          onToken={(token) => {
            onToken(token);
            if (token && fieldError === "turnstileToken") setFieldError(null);
          }}
        />
      </div>

      {result ? (
        <p
          className={result.type === "already" ? styles.already : styles.error}
          role={result.type === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {result.text}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className="button button--coral" type="submit" disabled={sending || !siteKey || !turnstileToken} aria-busy={sending}>
          {sending ? "Odosielam…" : "Odoslať recenziu"}
        </button>
        <Link className={styles.cancelLink} href={profileHref}>Zrušiť a vrátiť sa na profil</Link>
      </div>

      <p className={styles.privacy}>
        Recenzia sa viaže iba na vašu reviewer identitu. Neukladáme do nej IP adresu, browser fingerprint ani Partner účet.
      </p>
    </form>
  );
}
