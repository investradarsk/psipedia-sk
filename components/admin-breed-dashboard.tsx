"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ManagedBreedSummary } from "@/lib/breed-store";
import { SearchIcon } from "./icons";

export function AdminBreedDashboard({ initialBreeds }: { initialBreeds: ManagedBreedSummary[] }) {
  const [breeds, setBreeds] = useState(initialBreeds);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return breeds.filter((breed) => !needle || `${breed.name} ${breed.slug} ${breed.group} ${breed.origin}`.toLocaleLowerCase("sk").includes(needle));
  }, [breeds, query]);

  async function remove(breed: ManagedBreedSummary) {
    if (!window.confirm(`Naozaj chceš odstrániť plemeno „${breed.name}“?`)) return;
    const response = await fetch(`/api/admin/breeds/${breed.id}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) return setMessage(data.error || "Plemeno sa nepodarilo odstrániť.");
    setBreeds((items) => items.filter((item) => item.id !== breed.id));
    setMessage("Plemeno bolo odstránené.");
  }

  return <>
    <section className="admin-stats" aria-label="Stav atlasu">
      <div><span>Všetky plemená</span><strong>{breeds.length}</strong></div>
      <div><span>Publikované</span><strong>{breeds.filter((item) => item.status === "published").length}</strong></div>
      <div><span>Koncepty</span><strong>{breeds.filter((item) => item.status === "draft").length}</strong></div>
    </section>
    <section className="admin-panel">
      <div className="admin-toolbar"><label className="admin-search"><SearchIcon size={19}/><span className="sr-only">Hľadať plemeno</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hľadať plemeno"/></label></div>
      {message && <p className="admin-flash" role="status">{message}</p>}
      <div className="admin-article-list">
        {visible.map((breed) => <article className="admin-article-row" key={breed.id}>
          <div className={`admin-article-thumb admin-article-thumb--${breed.accent}`}>{breed.image ? <img src={breed.image} alt=""/> : <span>🐕</span>}</div>
          <div className="admin-article-main"><div className="admin-article-tags"><span className={`admin-status admin-status--${breed.status}`}>{breed.status === "published" ? "Publikované" : "Koncept"}</span><span>FCI {breed.fciGroup}</span><span>{breed.origin}</span></div><h2><Link href={`/admin/plemena/${breed.id}`}>{breed.name}</Link></h2><p>{breed.group}</p></div>
          <div className="admin-row-actions">{breed.status === "published" && <Link href={`/plemena/${breed.slug}`} target="_blank">Pozrieť ↗</Link>}<Link className="admin-row-edit" href={`/admin/plemena/${breed.id}`}>Upraviť</Link><button type="button" onClick={() => void remove(breed)}>Odstrániť</button></div>
        </article>)}
      </div>
    </section>
  </>;
}
