"use client";

import { FormEvent, useState } from "react";

type ImportPayload = {
  articles?: unknown[];
  profiles?: unknown[];
  events?: unknown[];
  helpItems?: unknown[];
  inquiries?: unknown[];
  legal?: Record<string, unknown>;
};

const inputs = [
  { name: "articles", label: "Články a koncepty", sourceKey: "articles" },
  { name: "profiles", label: "Adresár", sourceKey: "profiles" },
  { name: "events", label: "Podujatia", sourceKey: "events" },
  { name: "helpItems", label: "Pomoc psom", sourceKey: "items" },
  { name: "legal", label: "Právne nastavenia", sourceKey: "settings" },
  { name: "inquiries", label: "Dopyty", sourceKey: "inquiries" },
] as const;

async function readJson(file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} je príliš veľký.`);
  return JSON.parse(await file.text()) as Record<string, unknown>;
}

export function AdminDataImport() {
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(""); setError(""); setBusy(true);
    try {
      const payload: ImportPayload = {};
      for (const input of inputs) {
        const file = files[input.name];
        if (!file) throw new Error(`Vyber súbor: ${input.label}.`);
        const json = await readJson(file);
        const value = json[input.sourceKey];
        if (input.name === "legal") payload.legal = value as Record<string, unknown>;
        else payload[input.name] = value as unknown[];
      }
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { error?: string; imported?: Record<string, number> };
      if (!response.ok) throw new Error(data.error || "Import sa nepodaril.");
      const imported = data.imported ?? {};
      setMessage(`Import je hotový: ${imported.articles ?? 0} článkov, ${imported.profiles ?? 0} profilov, ${imported.events ?? 0} podujatí a ${imported.help ?? 0} prípadov pomoci.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Import sa nepodaril.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-panel admin-import-panel" onSubmit={submit}>
      <p>Súbory sa odošlú priamo do chránenej databázy Cloudflare D1. Neukladajú sa do GitHubu.</p>
      <div className="admin-import-grid">
        {inputs.map((input) => (
          <label key={input.name}>
            <span>{input.label}</span>
            <input type="file" accept="application/json,.json" required onChange={(event) => setFiles((current) => ({ ...current, [input.name]: event.target.files?.[0] }))} />
          </label>
        ))}
      </div>
      <button className="admin-publish" type="submit" disabled={busy}>{busy ? "Importujem…" : "Importovať všetky dáta"}</button>
      {message && <p className="admin-flash" role="status">{message}</p>}
      {error && <p className="admin-editor-message is-error" role="alert">{error}</p>}
    </form>
  );
}
