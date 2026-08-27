"use client";

import { FormEvent, useState } from "react";
import { directoryCategories } from "@/lib/directory";

type ImportPayload = {
  articles?: unknown[];
  profiles?: unknown[];
  events?: unknown[];
  helpItems?: unknown[];
  inquiries?: unknown[];
  legal?: Record<string, unknown>;
  profileCategory?: string;
};

const inputs = [
  { name: "articles", label: "Články a koncepty", sourceKey: "articles" },
  { name: "profiles", label: "Služby pre psov", sourceKey: "profiles" },
  { name: "events", label: "Podujatia", sourceKey: "events" },
  { name: "helpItems", label: "Pomoc psom", sourceKey: "items" },
  { name: "legal", label: "Právne nastavenia", sourceKey: "settings" },
  { name: "inquiries", label: "Dopyty", sourceKey: "inquiries" },
] as const;

async function readJson(file: File): Promise<unknown> {
  if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} je príliš veľký.`);
  return JSON.parse(await file.text()) as unknown;
}

export function AdminDataImport() {
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileCategory, setProfileCategory] = useState("kynologicke-kluby");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(""); setError(""); setBusy(true);
    try {
      const payload: ImportPayload = {};
      let selectedFiles = 0;
      for (const input of inputs) {
        const file = files[input.name];
        if (!file) continue;
        selectedFiles += 1;
        const json = await readJson(file);
        const value = Array.isArray(json) ? json : json && typeof json === "object" ? (json as Record<string, unknown>)[input.sourceKey] : undefined;
        if (input.name === "legal") payload.legal = value as Record<string, unknown>;
        else payload[input.name] = value as unknown[];
      }
      if (!selectedFiles) throw new Error("Vyber aspoň jeden JSON súbor.");
      if (payload.profiles) payload.profileCategory = profileCategory;
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
      <p>Vyber jeden alebo viac JSON súborov. Import aktualizuje existujúce záznamy podľa stabilného importného kľúča a nepridá ich znova.</p>
      <div className="admin-import-grid">
        {inputs.map((input) => (
          <label key={input.name}>
            <span>{input.label}</span>
            <input type="file" accept="application/json,.json" onChange={(event) => setFiles((current) => ({ ...current, [input.name]: event.target.files?.[0] }))} />
          </label>
        ))}
        <label><span>Kategória importovaných profilov</span><select value={profileCategory} onChange={(event) => setProfileCategory(event.target.value)}>{directoryCategories.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}</select></label>
      </div>
      <button className="admin-publish" type="submit" disabled={busy}>{busy ? "Importujem…" : "Importovať vybrané dáta"}</button>
      {message && <p className="admin-flash" role="status">{message}</p>}
      {error && <p className="admin-editor-message is-error" role="alert">{error}</p>}
    </form>
  );
}
