"use client";

import { useMemo, useState } from "react";
import type { FciGroup } from "@/lib/content";
import type { ManagedBreedIndexItem } from "@/lib/breed-store";
import { normalizeBreedSearchText } from "@/lib/breed-fci";
import { BreedCard } from "./breed-card";
import { SearchIcon } from "./icons";

function breedCountLabel(count: number) {
  if (count === 1) return "1 plemeno";
  if (count > 1 && count < 5) return `${count} plemená`;
  return `${count} plemien`;
}

const shortGroupLabels: Record<number, string> = {
  1: "Ovčiarske", 2: "Pinče, bradáče a molosy", 3: "Teriéry", 4: "Jazvečíky", 5: "Špice",
  6: "Duriče", 7: "Stavače", 8: "Retrievery", 9: "Spoločenské", 10: "Chrty",
};

export function BreedBrowser({ breeds, groups }: { breeds: ManagedBreedIndexItem[]; groups: FciGroup[] }) {
  const [query, setQuery] = useState("");
  const [energy, setEnergy] = useState("all");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedOrigin, setSelectedOrigin] = useState("all");
  const [shown,setShown]=useState(60);
  const origins = useMemo(() => [...new Set(breeds.map((breed) => breed.origin).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"sk")), [breeds]);

  const visible = useMemo(() => {
    const normalized = normalizeBreedSearchText(query);
    return breeds.filter((breed) => {
      const queryMatch = !normalized || normalizeBreedSearchText(`${breed.name} ${breed.officialFciName} ${breed.group} ${breed.fciSection} ${breed.intro} ${breed.searchText}`).includes(normalized);
      const energyMatch = energy === "all" || (breed.editorialComplete && (energy === "calm" ? breed.energy <= 3 : breed.energy >= 4));
      const groupMatch = selectedGroup === "all" || breed.fciGroup === Number(selectedGroup);
      const originMatch = selectedOrigin === "all" || breed.origin === selectedOrigin;
      return queryMatch && energyMatch && groupMatch && originMatch;
    });
  }, [breeds, query, energy, selectedGroup, selectedOrigin]);

  const displayed=useMemo(()=>visible.slice(0,shown),[visible,shown]);
  const groupedBreeds = useMemo(() => groups
    .map((group) => ({
      group,
      breeds: displayed
        .filter((breed) => breed.fciGroup === group.number)
        .sort((first, second) => first.name.localeCompare(second.name, "sk")),
    }))
    .filter((entry) => entry.breeds.length > 0), [groups, displayed]);

  return (
    <div>
      <div className="browser-toolbar breed-search-wrap">
        <label className="inline-search breed-search-primary">
          <SearchIcon size={22} />
          <span className="sr-only">Hľadať plemeno podľa názvu, pôvodu alebo FCI skupiny</span>
          <input value={query} onChange={(event) => {setQuery(event.target.value);setShown(60);}} placeholder="Hľadať plemeno, krajinu alebo FCI skupinu" />
        </label>
        <label className="breed-origin-filter"><span className="sr-only">Krajina pôvodu</span><select value={selectedOrigin} onChange={(event)=>{setSelectedOrigin(event.target.value);setShown(60);}}><option value="all">Všetky krajiny pôvodu</option>{origins.map((origin)=><option value={origin} key={origin}>{origin}</option>)}</select></label>
        <div className="filter-row" role="group" aria-label="Filtrovať podľa redakčne potvrdenej energie">
          <button type="button" className={energy === "all" ? "is-active" : ""} aria-pressed={energy === "all"} onClick={() => {setEnergy("all");setShown(60);}}>Všetky</button>
          <button type="button" className={energy === "calm" ? "is-active" : ""} aria-pressed={energy === "calm"} onClick={() => {setEnergy("calm");setShown(60);}}>Pokojnejšie</button>
          <button type="button" className={energy === "active" ? "is-active" : ""} aria-pressed={energy === "active"} onClick={() => {setEnergy("active");setShown(60);}}>Aktívne</button>
        </div>
      </div>
      <div className="fci-filter-panel" aria-label="FCI skupiny">
        <div className="fci-filter-row" role="group" aria-label="Filtrovať podľa skupiny FCI">
          <button type="button" className={selectedGroup === "all" ? "is-active" : ""} aria-pressed={selectedGroup === "all"} onClick={() => {setSelectedGroup("all");setShown(60);}}>Všetky</button>
          {groups.map((group) => (
            <button
              type="button"
              key={group.number}
              className={selectedGroup === String(group.number) ? "is-active" : ""}
              aria-pressed={selectedGroup === String(group.number)}
              onClick={() => {setSelectedGroup(String(group.number));setShown(60);}}
              aria-label={`FCI skupina ${group.number}: ${group.label}`}
              title={group.label}
            >
              <strong>{group.number}</strong> {shortGroupLabels[group.number]}
            </button>
          ))}
        </div>
      </div>
      <p className="result-count" aria-live="polite">{breedCountLabel(visible.length)}</p>
      {visible.length ? (
        <div className="fci-group-list">
          {groupedBreeds.map(({ group, breeds: groupBreeds }) => (
            <section className="fci-group-section" id={`fci-${group.number}`} key={group.number}>
              <header className="fci-group-heading">
                <span className="fci-group-number" aria-hidden="true">{String(group.number).padStart(2, "0")}</span>
                <div>
                  <span className="eyebrow">FCI skupina {group.number}</span>
                  <h2>{group.label}</h2>
                  <p>{group.description}</p>
                </div>
                <span className="fci-group-count">{breedCountLabel(groupBreeds.length)}</span>
              </header>
              <div className="breed-grid">{groupBreeds.map((breed) => <BreedCard breed={breed} key={breed.slug} />)}</div>
            </section>
          ))}
          {displayed.length<visible.length&&<div className="breed-load-more"><button type="button" className="button button--dark" onClick={()=>setShown((value)=>value+60)}>Zobraziť ďalšie plemená</button><span>{displayed.length} z {visible.length}</span></div>}
        </div>
      ) : (
        <div className="empty-state"><span>🐕</span><h2>Také plemeno tu zatiaľ nemáme</h2><p>Skús inú časť názvu alebo zruš filter.</p></div>
      )}
    </div>
  );
}
