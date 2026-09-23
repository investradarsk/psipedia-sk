"use client";

import { useMemo, useState } from "react";
import type { PartnerProfileEditableValue, PartnerProfileFieldDefinition } from "@/lib/partner-profile-changes";

type Props = {
  resourceId: string;
  fields: readonly PartnerProfileFieldDefinition[];
  values: Record<string, PartnerProfileEditableValue>;
  baseRevision: string;
};

function uiValue(field: PartnerProfileFieldDefinition, value: PartnerProfileEditableValue | undefined) {
  if (field.kind === "boolean") return value === true;
  if (field.kind === "list") return Array.isArray(value) ? value.join("\n") : "";
  return typeof value === "string" ? value : "";
}

function apiValue(field: PartnerProfileFieldDefinition, value: string | boolean) {
  if (field.kind === "boolean") return Boolean(value);
  if (field.kind === "list") {
    return String(value).split("\n").map((item) => item.trim()).filter(Boolean);
  }
  return String(value);
}

export function PartnerProfileEditForm({ resourceId, fields, values, baseRevision }: Props) {
  const initial = useMemo(() => Object.fromEntries(fields.map((field) => [field.key, uiValue(field, values[field.key])])), [fields, values]);
  const [draft, setDraft] = useState<Record<string, string | boolean>>(initial);
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      const before = apiValue(field, initial[field.key]);
      const after = apiValue(field, draft[field.key]);
      if (JSON.stringify(before) !== JSON.stringify(after)) patch[field.key] = after;
    }
    if (!Object.keys(patch).length) {
      setState("error");
      setMessage("Nezmenili ste žiadny údaj.");
      return;
    }
    setState("sending");
    setMessage("");
    try {
      const response = await fetch("/api/partner/profile-changes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceId, baseRevision, patch }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Návrh sa nepodarilo odoslať.");
      setState("success");
      setMessage("Zmeny sme prijali a čakajú na kontrolu.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať.");
    }
  }

  return (
    <form className="partner-profile-edit-form" onSubmit={submit}>
      <div className="partner-profile-edit-grid">
        {fields.map((field) => {
          const value = draft[field.key] ?? "";
          if (field.kind === "boolean") {
            return (
              <label className="partner-profile-check" key={field.key}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.checked }))}
                  disabled={state === "success"}
                />
                <span>{field.label}</span>
              </label>
            );
          }
          if (field.kind === "select") {
            return (
              <label className="partner-field" key={field.key}>
                <span>{field.label}</span>
                <select
                  value={String(value)}
                  required={field.required}
                  onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                  disabled={state === "success"}
                >
                  {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            );
          }
          if (field.kind === "textarea" || field.kind === "list") {
            return (
              <label className="partner-field partner-field--wide" key={field.key}>
                <span>{field.label}</span>
                <textarea
                  rows={field.kind === "list" ? 5 : 7}
                  value={String(value)}
                  required={field.required}
                  onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                  disabled={state === "success"}
                />
                {field.kind === "list" ? <small>Jedna položka na riadok.</small> : null}
              </label>
            );
          }
          return (
            <label className="partner-field" key={field.key}>
              <span>{field.label}</span>
              <input
                type={field.kind === "email" ? "email" : field.kind === "url" ? "url" : "text"}
                value={String(value)}
                required={field.required}
                onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                disabled={state === "success"}
              />
            </label>
          );
        })}
      </div>
      <div className="partner-profile-edit-submit">
        <div>
          <strong>Žiadna zmena sa nezverejní okamžite.</strong>
          <p>Po odoslaní vznikne moderovaný návrh. Verejný profil sa zmení až po schválení administrátorom.</p>
        </div>
        <button className="button button--dark" type="submit" disabled={state === "sending" || state === "success"}>
          {state === "sending" ? "Odosielam…" : "Odoslať zmeny na kontrolu"}
        </button>
      </div>
      {message ? <p className={`partner-form-message ${state === "success" ? "is-success" : "is-error"}`} role="status">{message}</p> : null}
    </form>
  );
}
