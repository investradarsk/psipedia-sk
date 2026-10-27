"use client";

import Link from "next/link";
import { PublicEmptyState, PublicFilterTag } from "@/components/public-visual-system/public-result-states";
import { PublicActionButton } from "@/components/public-visual-system";
import { PublicSelect, PublicTextInput } from "@/components/public-visual-system/public-form-controls";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FciGroup } from "@/lib/content";
import type { BreedAtlasCard } from "@/lib/breed-store";
import { normalizeBreedSearchText } from "@/lib/breed-fci";
import { breedAtlasHref, listFciSectionOptions, validFciSectionForGroup, type BreedAtlasFilters } from "@/lib/breed-atlas";
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

const INITIAL_BREED_COUNT = 24;
const MORE_BREED_COUNT = 24;

export function BreedBrowser({ breeds, groups, initialFilters, actions, hidePrimarySearch = false }: { breeds: BreedAtlasCard[]; groups: FciGroup[]; initialFilters: BreedAtlasFilters; actions?: ReactNode; hidePrimarySearch?: boolean }) {
  const [query, setQuery] = useState(initialFilters.query);
  const [shown,setShown]=useState(INITIAL_BREED_COUNT);
  // The only visible query input now lives in the shared photographic hero.
  // Keep the existing instant atlas filtering and its URL synchronization.
  useEffect(() => {
    if (!hidePrimarySearch) return;
    const input = document.getElementById("breed-hero-search");
    if (!(input instanceof HTMLInputElement)) return;
    const sync = () => { setQuery(input.value); setShown(INITIAL_BREED_COUNT); };
    input.addEventListener("input", sync);
    return () => input.removeEventListener("input", sync);
  }, [hidePrimarySearch]);
  const [selectedGroup, setSelectedGroup] = useState(initialFilters.fciGroup || "all");
  const [selectedSection, setSelectedSection] = useState(() => validFciSectionForGroup(breeds, initialFilters.fciGroup, initialFilters.fciSection));
  const [selectedOrigin, setSelectedOrigin] = useState(initialFilters.origin || "all");
  const origins = useMemo(() => [...new Set(breeds.map((breed) => breed.origin).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"sk")), [breeds]);
  const sectionOptions = useMemo(() => listFciSectionOptions(breeds, selectedGroup === "all" ? "" : selectedGroup), [breeds, selectedGroup]);

  useEffect(() => {
    const href = breedAtlasHref({
      query,
      fciGroup: selectedGroup === "all" ? "" : selectedGroup,
      fciSection: selectedSection,
      origin: selectedOrigin === "all" ? "" : selectedOrigin,
    });
    window.history.replaceState(null, "", href);
    // Keep hero form facets in step with client-side FCI and origin changes.
    const form = document.querySelector<HTMLFormElement>('form[data-public-search-form="breeds"]');
    if (form) {
      for (const [name, value] of [
        ["fciGroup", selectedGroup === "all" ? "" : selectedGroup],
        ["fciSection", selectedSection],
        ["origin", selectedOrigin === "all" ? "" : selectedOrigin],
      ]) {
        let field = form.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
        if (!value) { field?.remove(); continue; }
        if (!field) {
          field = document.createElement("input");
          field.type = "hidden";
          field.name = name;
          form.appendChild(field);
        }
        field.value = value;
      }
    }
  }, [query, selectedGroup, selectedSection, selectedOrigin]);

  const visible = useMemo(() => {
    const normalized = normalizeBreedSearchText(query);
    return breeds.filter((breed) => {
      const queryMatch = !normalized || normalizeBreedSearchText(`${breed.name} ${breed.officialFciName} ${breed.group} ${breed.fciSection} ${breed.intro} ${breed.searchText}`).includes(normalized);
      const groupMatch = selectedGroup === "all" || breed.fciGroup === Number(selectedGroup);
      const sectionMatch = !selectedSection || breed.fciSectionNumber === selectedSection;
      const originMatch = selectedOrigin === "all" || breed.origin === selectedOrigin;
      return queryMatch && groupMatch && sectionMatch && originMatch;
    });
  }, [breeds, query, selectedGroup, selectedSection, selectedOrigin]);

  const currentFilters: BreedAtlasFilters = {
    query,
    fciGroup: selectedGroup === "all" ? "" : selectedGroup,
    fciSection: selectedSection,
    origin: selectedOrigin === "all" ? "" : selectedOrigin,
  };
  const activeSelections: Array<{ key: keyof BreedAtlasFilters; label: string; value: string }> = [
    { key: "query", label: "Hľadanie", value: currentFilters.query },
    { key: "origin", label: "Pôvod", value: currentFilters.origin },
    { key: "fciGroup", label: "FCI skupina", value: currentFilters.fciGroup },
    { key: "fciSection", label: "FCI sekcia", value: currentFilters.fciSection },
  ].filter((entry) => Boolean(entry.value));
  const clearOneHref = (key: keyof BreedAtlasFilters) => breedAtlasHref({
    ...currentFilters,
    [key]: "",
    ...(key === "fciGroup" ? { fciSection: "" } : {}),
  });

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
        {!hidePrimarySearch && <label className="inline-search breed-search-primary">
          <SearchIcon size={22} />
          <span className="sr-only">Hľadať plemeno podľa názvu, pôvodu alebo FCI skupiny</span>
          <PublicTextInput appearance="context" value={query} onChange={(event) => {setQuery(event.target.value);setShown(INITIAL_BREED_COUNT);}} placeholder="Hľadať plemeno, krajinu alebo FCI skupinu" />
        </label>}
        <label className="breed-origin-filter"><span className="sr-only">Krajina pôvodu</span><PublicSelect appearance="context" value={selectedOrigin} onChange={(event)=>{setSelectedOrigin(event.target.value);setShown(INITIAL_BREED_COUNT);}}><option value="all">Všetky krajiny pôvodu</option>{origins.map((origin)=><option value={origin} key={origin}>{origin}</option>)}</PublicSelect></label>
      </div>
      {actions}
      {activeSelections.length > 0 && (
        <div aria-label="Aktívne filtre plemien" data-public-active-filters>
          <span data-public-active-filter-label>Aktívne filtre</span>
          {activeSelections.map(({ key, label, value }) => (
            <PublicFilterTag key={key} href={clearOneHref(key)} removeLabel={`Odstrániť filter ${label}: ${value}`}>
              <span>{label}: {value}</span><span aria-hidden="true">×</span>
            </PublicFilterTag>
          ))}
          <Link href="/plemena" data-public-filter-reset>Vymazať všetko</Link>
        </div>
      )}
      <div className="fci-filter-panel" aria-label="FCI skupiny">
        <div className="fci-filter-row" role="group" aria-label="Filtrovať podľa skupiny FCI">
          <button type="button" className={selectedGroup === "all" ? "is-active" : ""} aria-pressed={selectedGroup === "all"} onClick={() => {setSelectedGroup("all");setSelectedSection("");setShown(INITIAL_BREED_COUNT);}}>Všetky</button>
          {groups.map((group) => (
            <button
              type="button"
              key={group.number}
              className={selectedGroup === String(group.number) ? "is-active" : ""}
              aria-pressed={selectedGroup === String(group.number)}
              onClick={() => {setSelectedGroup(String(group.number));setSelectedSection("");setShown(INITIAL_BREED_COUNT);}}
              aria-label={`FCI skupina ${group.number}: ${group.label}`}
              title={group.label}
            >
              <strong>{group.number}</strong> {shortGroupLabels[group.number]}
            </button>
          ))}
        </div>
        <label className="fci-section-filter">
          <span>FCI sekcia</span>
          <PublicSelect appearance="context"
            value={selectedSection}
            disabled={selectedGroup === "all" || sectionOptions.length === 0}
            onChange={(event) => { setSelectedSection(event.target.value); setShown(INITIAL_BREED_COUNT); }}
          >
            <option value="">{selectedGroup === "all" ? "Najprv vyberte FCI skupinu" : sectionOptions.length ? "Všetky sekcie" : "Skupina nemá členené sekcie"}</option>
            {sectionOptions.map((section) => <option value={section.number} key={section.number}>Sekcia {section.number}{section.name ? ` · ${section.name}` : ""}</option>)}
          </PublicSelect>
        </label>
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
          {displayed.length<visible.length&&<div className="breed-load-more"><PublicActionButton type="button" onClick={()=>setShown((value) => value + MORE_BREED_COUNT)}>Zobraziť ďalšie plemená</PublicActionButton><span>{displayed.length} z {visible.length}</span></div>}
        </div>
      ) : (
        <PublicEmptyState variant="listing" icon="🐕" title="Také plemeno tu zatiaľ nemáme" description="Skús inú časť názvu alebo zruš filter." />
      )}
    </div>
  );
}
