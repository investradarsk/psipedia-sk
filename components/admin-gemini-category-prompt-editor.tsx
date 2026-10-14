"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { geminiAutomationSections, type GeminiSectionKey } from "@/lib/gemini-automation-catalog";
import {
  GEMINI_PROMPT_MAX_LENGTH, GEMINI_PROMPT_MIN_LENGTH,
  type GeminiCategoryPromptView,
} from "@/lib/gemini-automation-category-prompts";
import styles from "./admin-gemini-category-prompt-editor.module.css";

type Result = { error?: string; prompt?: GeminiCategoryPromptView };

function formatUpdated(value: string | null) {
  if (!value) return "Ešte neupravené";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(date);
}

export function AdminGeminiCategoryPromptEditor({
  initialPrompts, selectedKey, available,
}: {
  initialPrompts: readonly GeminiCategoryPromptView[];
  selectedKey: string;
  available: boolean;
}) {
  const initial = initialPrompts.find((item) => item.stableKey === selectedKey)!;
  return (
    <GeminiCategoryPromptForm
      key={selectedKey}
      initial={initial}
      initialPrompts={initialPrompts}
      selectedKey={selectedKey}
      available={available}
    />
  );
}

function GeminiCategoryPromptForm({
  initial, initialPrompts, selectedKey, available,
}: {
  initial: GeminiCategoryPromptView;
  initialPrompts: readonly GeminiCategoryPromptView[];
  selectedKey: string;
  available: boolean;
}) {
  const [current, setCurrent] = useState(initial);
  const [draft, setDraft] = useState(initial.effectivePrompt);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = draft !== current.effectivePrompt;
  const valid = draft.trim().length >= GEMINI_PROMPT_MIN_LENGTH
    && draft.trim().length <= GEMINI_PROMPT_MAX_LENGTH;
  const categoriesFor = (key: GeminiSectionKey) =>
    initialPrompts.filter((item) => item.section === key);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || busy || !valid) return;
    setBusy(true);
    setMessage("");
    setError("");
    setConfirmReset(false);
    try {
      const response = await fetch("/api/admin/gemini-automation/prompts", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stable_key: current.stableKey, user_prompt: draft }),
      });
      const data = await response.json() as Result;
      if (!response.ok || !data.prompt) {
        setError(data.error ?? "Prompt sa nepodarilo uložiť.");
      } else {
        setCurrent(data.prompt);
        setDraft(data.prompt.effectivePrompt);
        setMessage("Vlastný prompt bol uložený do D1. Gemini sa nespustilo.");
      }
    } catch {
      setError("Ukladanie zlyhalo. Skontroluj pripojenie.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!available || busy) return;
    if (!current.customized) {
      setDraft(current.defaultPrompt);
      setError("");
      setMessage("V editore je predvolené znenie. Nie je potrebné nič ukladať.");
      return;
    }
    if (!confirmReset) {
      setConfirmReset(true);
      setError("");
      setMessage("");
      return;
    }
    setBusy(true);
    setConfirmReset(false);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/gemini-automation/prompts", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stable_key: current.stableKey }),
      });
      const data = await response.json() as Result;
      if (!response.ok || !data.prompt) {
        setError(data.error ?? "Predvolený prompt sa nepodarilo obnoviť.");
      } else {
        setCurrent(data.prompt);
        setDraft(data.prompt.effectivePrompt);
        setMessage("Vlastný prompt bol odstránený. Používa sa predvolený text.");
      }
    } catch {
      setError("Obnovenie zlyhalo. Skontroluj pripojenie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.layout}>
      <nav className={styles.categories} aria-label="Kategórie Gemini promptov">
        <h2>Vyber kategóriu</h2>
        {geminiAutomationSections.map((section) => (
          <section key={section.key}>
            <h3>{section.label}</h3>
            <ul>
              {categoriesFor(section.key).map((item) => (
                <li key={item.stableKey}>
                  <Link
                    href={"/admin/automatizacie-gemini/prompty?stable_key=" + encodeURIComponent(item.stableKey)}
                    aria-current={item.stableKey === selectedKey ? "page" : undefined}
                    className={item.stableKey === selectedKey ? styles.active : styles.categoryLink}
                    onClick={(event) => {
                      if (dirty && item.stableKey !== selectedKey &&
                          !window.confirm("Máš neuložené zmeny. Naozaj chceš prejsť na inú kategóriu?")) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    <small>{item.stableKey === selectedKey ? (current.customized ? "Vlastný" : "Predvolený") :
                      (item.customized ? "Vlastný" : "Predvolený")}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <section className={styles.editor} aria-labelledby="gemini-prompt-title">
        <div className={styles.titleRow}>
          <div>
            <h2 id="gemini-prompt-title">{current.label}</h2>
            <p className={styles.key}>{current.stableKey}</p>
          </div>
          <span className={styles.status}>{current.customized ? "Vlastný prompt" : "Predvolený prompt"}</span>
        </div>
        <p>
          Tento text slúži ako redakčné zadanie. Technické pravidlá sú nezávislé:
          Gemini môže vytvárať iba neverejné koncepty, nie automaticky publikovať.
        </p>
        <form onSubmit={save} className={styles.form}>
          <label htmlFor="gemini-category-prompt">Text promptu</label>
          <textarea
            id="gemini-category-prompt"
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setMessage(""); setError(""); setConfirmReset(false); }}
            minLength={GEMINI_PROMPT_MIN_LENGTH}
            maxLength={GEMINI_PROMPT_MAX_LENGTH}
            rows={16}
            disabled={!available || busy}
            required
            spellCheck
          />
          <div className={styles.meta}>
            <span>{draft.trim().length} / {GEMINI_PROMPT_MAX_LENGTH} znakov</span>
            <span>Posledná úprava: {formatUpdated(current.updatedAt)}</span>
          </div>
          <div className={styles.actions}>
            <button type="submit" className="admin-primary-action"
              disabled={!available || busy || !valid || (!dirty && current.customized)}>
              {busy ? "Spracúvam…" : "Uložiť prompt"}
            </button>
            <button type="button" className="admin-secondary-action"
              onClick={reset} disabled={!available || busy}>
              {confirmReset ? "Potvrdiť obnovenie" : "Obnoviť predvolený"}
            </button>
            {confirmReset && <button type="button" onClick={() => setConfirmReset(false)}
              disabled={busy}>Zrušiť</button>}
          </div>
          {confirmReset && <p role="alert">Vlastné znenie tejto kategórie sa odstráni z D1.</p>}
          {message && <p role="status" className={styles.success}>{message}</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </form>
        <p className={styles.note}>
          Úprava promptu ani jeho obnovenie nevykoná platené volanie a nevytvorí koncept.
          Použitie uloženého textu v externom Gemini pracovníkovi zabezpečí samostatná integrácia.
        </p>
      </section>
    </div>
  );
}
