"use client";

import { useMemo, useState } from "react";
import type { Breed, FciGroup } from "@/lib/content";
import { BreedCard } from "./breed-card";
import { SearchIcon } from "./icons";

function breedCountLabel(count: number) {
  if (count === 1) return "1 plemeno";
  if (count > 1 && count < 5) return `${count} plemená`;
  return `${count} plemien`;
}

export function BreedBrowser({ breeds, groups }: { breeds: Breed[]; groups: FciGroup[] }) {
  const [query, setQuery] = useState("");
  const [energy, setEnergy] = useState("all");
  const [selectedGroup, setSelectedGroup] = useState("all");

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sk");
    return breeds.filter((breed) => {
      const queryMatch = !normalized || `${breed.name} ${breed.group} ${breed.fciSection} ${breed.intro}`.toLocaleLowerCase("sk").includes(normalized);
      const energyMatch = energy === "all" || (energy === "calm" ? breed.energy <= 3 : breed.energy >= 4);
      const groupMatch = selectedGroup === "all" || breed.fciGroup === Number(selectedGroup);
      return queryMatch && energyMatch && groupMatch;
    });
  }, [breeds, query, energy, selectedGroup]);

  const groupedBreeds = useMemo(() => groups
    .map((group) => ({
      group,
      breeds: visible
        .filter((breed) => breed.fciGroup === group.number)
        .sort((first, second) => first.name.localeCompare(second.name, "sk")),
    }))
    .filter((entry) => entry.breeds.length > 0), [groups, visible]);

  return (
    <div>
      <div className="fci-filter-panel">
        <div className="fci-filter-intro">
          <span className="eyebrow">Medzinárodné členenie</span>
          <strong>Vyber si jednu z 10 skupín FCI</strong>
        </div>
        <div className="fci-filter-row" role="group" aria-label="Filtrovať podľa skupiny FCI">
          <button type="button" className={selectedGroup === "all" ? "is-active" : ""} aria-pressed={selectedGroup === "all"} onClick={() => setSelectedGroup("all")}>Všetky</button>
          {groups.map((group) => (
            <button
              type="button"
              key={group.number}
              className={selectedGroup === String(group.number) ? "is-active" : ""}
              aria-pressed={selectedGroup === String(group.number)}
              onClick={() => setSelectedGroup(String(group.number))}
              aria-label={`FCI skupina ${group.number}: ${group.label}`}
              title={group.label}
            >
              FCI {group.number}
            </button>
          ))}
        </div>
      </div>
      <div className="browser-toolbar breed-search-wrap">
        <label className="inline-search">
          <SearchIcon size={19} />
          <span className="sr-only">Hľadať plemeno</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hľadať plemeno" />
        </label>
        <div className="filter-row" role="group" aria-label="Filtrovať podľa energie">
          <button type="button" className={energy === "all" ? "is-active" : ""} aria-pressed={energy === "all"} onClick={() => setEnergy("all")}>Všetky</button>
          <button type="button" className={energy === "calm" ? "is-active" : ""} aria-pressed={energy === "calm"} onClick={() => setEnergy("calm")}>Pokojnejšie</button>
          <button type="button" className={energy === "active" ? "is-active" : ""} aria-pressed={energy === "active"} onClick={() => setEnergy("active")}>Aktívne</button>
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
        </div>
      ) : (
        <div className="empty-state"><span>🐕</span><h2>Také plemeno tu zatiaľ nemáme</h2><p>Skús inú časť názvu alebo zruš filter.</p></div>
      )}
    </div>
  );
}
