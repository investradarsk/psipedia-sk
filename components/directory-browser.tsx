"use client";

import { useMemo, useState } from "react";
import { DirectoryCard } from "@/components/directory-card";
import { SearchIcon } from "@/components/icons";
import { directoryCategories, type DirectoryCategorySlug, type PublicDirectoryProfile } from "@/lib/directory";
import { slovakRegions, type SlovakRegion } from "@/lib/events";

type CategoryFilter = "all" | DirectoryCategorySlug;
type RegionFilter = "all" | SlovakRegion;

export function DirectoryBrowser({ profiles, initialCategory = "all" }: { profiles: PublicDirectoryProfile[]; initialCategory?: CategoryFilter }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [region, setRegion] = useState<RegionFilter>("all");
  const [onlineOnly, setOnlineOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return profiles.filter((profile) => {
      const searchable = `${profile.name} ${profile.excerpt} ${profile.city} ${profile.region} ${profile.services.join(" ")}`.toLocaleLowerCase("sk");
      return (category === "all" || profile.category === category)
        && (region === "all" || profile.region === region)
        && (!onlineOnly || profile.online)
        && (!needle || searchable.includes(needle));
    });
  }, [profiles, query, category, region, onlineOnly]);

  function reset() {
    setQuery("");
    setCategory(initialCategory);
    setRegion("all");
    setOnlineOnly(false);
  }

  return (
    <section className="directory-results" aria-labelledby="directory-results-heading">
      <div className="directory-toolbar">
        <label className="directory-search"><span>Hľadať v adresári</span><div><SearchIcon size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov, mesto alebo služba" /></div></label>
        <label><span>Kategória</span><select value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)}><option value="all">Všetky kategórie</option>{directoryCategories.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}</select></label>
        <label><span>Kraj</span><select value={region} onChange={(event) => setRegion(event.target.value as RegionFilter)}><option value="all">Všetky kraje</option>{slovakRegions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label className="directory-online-filter"><input type="checkbox" checked={onlineOnly} onChange={(event) => setOnlineOnly(event.target.checked)} /><span>Dostupné online</span></label>
      </div>

      <div className="directory-result-heading">
        <div><span className="eyebrow">Overené informácie</span><h2 id="directory-results-heading">Profily v adresári</h2></div>
        <strong>{filtered.length} {filtered.length === 1 ? "profil" : filtered.length > 1 && filtered.length < 5 ? "profily" : "profilov"}</strong>
      </div>

      {filtered.length ? (
        <div className="directory-grid">{filtered.map((profile) => <DirectoryCard profile={profile} key={profile.id} />)}</div>
      ) : (
        <div className="directory-empty">
          <span aria-hidden="true">📍</span>
          <h2>{profiles.length ? "Nenašli sme zhodu" : "Prvé profily pripravujeme"}</h2>
          <p>{profiles.length ? "Skús zmeniť kategóriu, kraj alebo hľadaný výraz." : "Sekciu postupne dopĺňame o nové overené profily."}</p>
          {profiles.length > 0 && <button type="button" onClick={reset}>Zrušiť filtre</button>}
        </div>
      )}
    </section>
  );
}
