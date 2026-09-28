"use client";

import { FormEvent, useState } from "react";

type Result = { type: "success" | "error"; text: string } | null;

export function ArticleFeedback({ articlePath, articleTitle }: { articlePath: string; articleTitle: string }) {
  const storageKey = `psipedia:feedback:${articlePath}`;
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const [missingText, setMissingText] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function send(helpful: boolean) {
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/article-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articlePath, articleTitle, helpful, missingText, website }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Hodnotenie sa nepodarilo odoslať.");
      try { window.localStorage.setItem(storageKey, "submitted"); } catch { /* hodnotenie zostáva uložené na serveri */ }
      setSubmitted(true);
      setResult({ type: "success", text: "Ďakujeme. Vaša odpoveď pomôže zlepšovať Psipediu." });
    } catch (error) {
      setResult({ type: "error", text: error instanceof Error ? error.message : "Hodnotenie sa nepodarilo odoslať." });
    } finally {
      setSending(false);
    }
  }

  function submitNo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(false);
  }

  if (submitted && !result) {
    return <section className="article-feedback is-complete" aria-label="Hodnotenie článku"><strong>Ďakujeme za hodnotenie.</strong></section>;
  }

  return (
    <section className="article-feedback" aria-labelledby="article-feedback-title">
      <div className="article-feedback-heading">
        <span aria-hidden="true">🐾</span>
        <div><h2 id="article-feedback-title">Bol pre vás článok užitočný?</h2><p>Jedným kliknutím nám pomôžete zlepšovať obsah.</p></div>
      </div>
      {!submitted && (
        <>
          <div className="article-feedback-actions">
            <button type="button" disabled={sending} onClick={() => { setChoice("yes"); void send(true); }}>👍 Áno</button>
            <button type="button" className={choice === "no" ? "is-active" : ""} disabled={sending} onClick={() => setChoice("no")}>👎 Nie</button>
          </div>
          {choice === "no" && (
            <form className="article-feedback-form" onSubmit={submitNo}>
              <label htmlFor="article-feedback-missing">Čo vám v článku chýbalo? <small>nepovinné</small></label>
              <textarea id="article-feedback-missing" value={missingText} onChange={(event) => setMissingText(event.target.value)} maxLength={500} rows={3} placeholder="Napíšte krátky podnet pre redakciu…" />
              <label className="article-feedback-honeypot" aria-hidden="true"><span>Web</span><input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></label>
              <div><small>{missingText.length} / 500</small><button type="submit" disabled={sending}>{sending ? "Odosielam…" : "Odoslať odpoveď"}</button></div>
            </form>
          )}
        </>
      )}
      {result && <p className={`article-feedback-result is-${result.type}`} role="status">{result.text}</p>}
    </section>
  );
}
