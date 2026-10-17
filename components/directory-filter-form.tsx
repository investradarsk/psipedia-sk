"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { DirectoryCategorySlug } from "@/lib/directory";
import { serviceFiltersForCategory } from "@/lib/directory-filter-contract";
import {
  publicDirectoryFacetKey, publicDirectoryFacetLabels, publicDirectoryFacetOptions,
} from "@/lib/directory-public-filters";
import { directoryQueryFields } from "@/lib/directory-query";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";
import styles from "./directory-filter-form.module.css";

const serviceLabels: Partial<Record<DirectoryCategorySlug, string>> = {
  veterinari: "Služba / špecializácia",
  treneri: "Zameranie / služba",
  "kynologicke-kluby": "Disciplína / služba",
  "chovatelske-kluby": "Zameranie",
  "chovatelske-stanice": "Zameranie",
  "salony-a-sluzby": "Služba",
  "hotely-a-opatrovanie": "Typ starostlivosti",
  vencenie: "Typ venčenia / služba",
  fyzioterapia: "Terapia / zameranie",
  "dalsie-sluzby": "Služba",
};

type Props = {
  filters: DirectoryFilters;
  options: PublicDirectoryProfilePage["options"];
  basePath: string;
  category?: DirectoryCategorySlug;
  mapHref: string;
};

function LocationSelectChange(event: ChangeEvent<HTMLSelectElement>, level: "region" | "district") {
  const form = event.currentTarget.form;
  if (!form) return;
  const child = form.elements.namedItem("city");
  if (child instanceof HTMLSelectElement) child.value = "";
  if (level === "region") {
    const district = form.elements.namedItem("district");
    if (district instanceof HTMLSelectElement) district.value = "";
  }
  form.requestSubmit();
}

function FilterFields({ filters, options, basePath, category, modal = false }: Props & { modal?: boolean }) {
  const activeCategory = category ?? filters.category;
  const serviceCategory = activeCategory || "dalsie-sluzby";
  const facets = serviceFiltersForCategory(activeCategory);
  const totalActive = [
    filters.query, filters.region, filters.district, filters.city,
    filters.service, filters.breed, filters.fciGroup, filters.organization,
    filters.profileType, filters.sort !== "recommended" ? filters.sort : "",
    ...Object.values(filters.facets ?? {}),
  ].filter(Boolean).length;

  return (
    <form
      className={styles.sidebarForm}
      action={basePath}
      method="get"
      data-directory-filter-form
      data-directory-modal={modal ? "true" : "false"}
      aria-label="Filtrovať služby pre psov"
    >
      {directoryQueryFields(filters, [
        "region", "district", "city", "service", "breed", "fci", "organization",
        "type", "sort", "page", "facets",
      ]).map((field) => <input type="hidden" name={field.name} value={field.value} key={field.name} />)}
      <div className={styles.heading}>
        <strong>Spresniť výsledky</strong>
        {totalActive > 0 && <span>{totalActive} aktívnych</span>}
      </div>
      <fieldset className={styles.group}>
        <legend>Lokalita</legend>
        <label><span>Kraj</span><select name="region" defaultValue={filters.region} onChange={(event) => LocationSelectChange(event, "region")}>
          <option value="">Všetky kraje</option>{options.regions.map((item) => <option value={item} key={item}>{item}</option>)}
        </select></label>
        <label><span>Okres</span><select name="district" defaultValue={filters.district} onChange={(event) => LocationSelectChange(event, "district")}>
          <option value="">Všetky okresy</option>{options.districts.map((item) => <option value={item} key={item}>{item}</option>)}
        </select></label>
        <label><span>Mesto/obec</span><select name="city" defaultValue={filters.city}>
          <option value="">Všetky mestá a obce</option>{options.cities.map((item) => <option value={item} key={item}>{item}</option>)}
        </select></label>
      </fieldset>
      {(options.services.length > 0 || options.breeds.length > 0 || options.fciGroups.length > 0 || options.organizations.length > 0 || options.profileTypes.length > 0) && (
        <fieldset className={styles.group}>
          <legend>Ďalšie možnosti</legend>
          {options.services.length > 0 &&
            <label><span>{serviceLabels[serviceCategory] ?? "Služba / zameranie"}</span><select name="service" defaultValue={filters.service}>
              <option value="">Všetky služby</option>{options.services.map((item) => <option value={item} key={item}>{item}</option>)}
            </select></label>}
          {options.breeds.length > 0 &&
            <label><span>Plemeno</span><select name="breed" defaultValue={filters.breed}>
              <option value="">Všetky plemená</option>{options.breeds.map((item) => <option value={item} key={item}>{item}</option>)}
            </select></label>}
          {options.fciGroups.length > 0 &&
            <label><span>FCI skupina</span><select name="fci" defaultValue={filters.fciGroup}>
              <option value="">Všetky FCI skupiny</option>{options.fciGroups.map((item) => <option value={item} key={item}>{item}</option>)}
            </select></label>}
          {options.organizations.length > 0 &&
            <label><span>Organizácia</span><select name="organization" defaultValue={filters.organization}>
              <option value="">Všetky organizácie</option>{options.organizations.map((item) => <option value={item} key={item}>{item}</option>)}
            </select></label>}
          {options.profileTypes.length > 0 &&
            <label><span>Typ služby / poskytovateľa</span><select name="type" defaultValue={filters.profileType}>
              <option value="">Všetky typy</option>{options.profileTypes.map((item) => <option value={item} key={item}>{item}</option>)}
            </select></label>}
        </fieldset>
      )}
      {facets.length > 0 && (
        <fieldset className={styles.group} data-directory-public-facets>
          <legend>Služby a vlastnosti</legend>
          <p className={styles.facetsHelp}>Zobrazujeme iba výslovne potvrdené hodnoty. Neznáme údaje sa ako „Áno“ ani „Nie“ nezapočítajú.</p>
          {facets.map((facet) => facet.valueType === "tri_state" ? (
            <fieldset className={styles.facetChoice} key={facet.id}>
              <legend>{facet.label}</legend>
              <div className={styles.choiceOptions}>
                {["", ...publicDirectoryFacetOptions(facet)].map((value) => (
                  <label className={styles.choiceOption} key={value || "any"}>
                    <input type="radio" name={publicDirectoryFacetKey(facet.id)} value={value}
                      defaultChecked={(filters.facets?.[facet.id] ?? "") === value} />
                    <span>{value ? publicDirectoryFacetLabels(value) : "Nezáleží"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <label key={facet.id}><span>{facet.label}</span>
              <select name={publicDirectoryFacetKey(facet.id)} defaultValue={filters.facets?.[facet.id] ?? ""}>
                <option value="">Nezáleží</option>
                {publicDirectoryFacetOptions(facet).map((value) =>
                  <option value={value} key={value}>{publicDirectoryFacetLabels(value)}</option>)}
              </select>
            </label>
          ))}
        </fieldset>
      )}
      <label><span>Zoradenie</span><select name="sort" defaultValue={filters.sort}>
        <option value="recommended">Odporúčané</option><option value="name-asc">Názov A–Z</option>
        <option value="name-desc">Názov Z–A</option><option value="newest">Najnovšie</option>
      </select></label>
      <div className={styles.actions}>
        <button className={styles.submit} type="submit">Použiť filtre</button>
        <Link className={styles.clear} href={basePath}>Zrušiť všetky filtre</Link>
      </div>
    </form>
  );
}

export function DirectoryFilterForm(props: Props) {
  const { filters, basePath, category, mapHref } = props;
  const disclosure = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Without JavaScript, the regular open details form remains available.
    if (window.matchMedia("(max-width: 820px)").matches) disclosure.current?.removeAttribute("open");
    setHydrated(true);
    return () => { dialog.current?.close(); };
  }, []);

  const activeFacets = serviceFiltersForCategory(category ?? filters.category).flatMap((facet) => {
    const value = filters.facets?.[facet.id];
    return value && publicDirectoryFacetOptions(facet).includes(value)
      ? [{ key: publicDirectoryFacetKey(facet.id), label: facet.label, value: publicDirectoryFacetLabels(value) }]
      : [];
  });
  const activeSelections = [
    { key: "q", label: "Hľadanie", value: filters.query },
    { key: "region", label: "Kraj", value: filters.region },
    { key: "district", label: "Okres", value: filters.district },
    { key: "city", label: "Mesto", value: filters.city },
    { key: "service", label: "Služba", value: filters.service },
    { key: "breed", label: "Plemeno", value: filters.breed },
    { key: "fci", label: "FCI", value: filters.fciGroup },
    { key: "organization", label: "Organizácia", value: filters.organization },
    { key: "type", label: "Typ", value: filters.profileType },
    { key: "sort", label: "Zoradenie", value: filters.sort === "recommended" ? "" : filters.sort },
    ...activeFacets,
  ].filter((entry) => entry.value);
  const clearOneHref = (key: string) => {
    const omitted = key === "region" ? ["region", "district", "city"]
      : key === "district" ? ["district", "city"] : [key];
    const params = new URLSearchParams();
    for (const field of directoryQueryFields(filters, ["page"])) {
      if (!omitted.includes(field.name)) params.set(field.name, field.value);
    }
    return basePath + (params.size ? "?" + params.toString() : "");
  };

  return (
    <>
      <div className={styles.mobileToolbar} data-hydrated={hydrated ? "true" : "false"} data-directory-mobile-filters>
        {hydrated && <button type="button" className={styles.modalTrigger}
          aria-haspopup="dialog" aria-controls="directory-filter-dialog"
          onClick={() => dialog.current?.showModal()}>
          Filtre{activeSelections.length > 0 ? ` (${activeSelections.length})` : ""}
        </button>}
        <Link className={styles.mapLink} href={mapHref}>Mapa →</Link>
      </div>
      <details ref={disclosure} open className={styles.disclosure}
        data-hydrated={hydrated ? "true" : "false"} data-directory-filter-disclosure>
        <summary className={styles.summary}>Filtre{activeSelections.length ? ` (${activeSelections.length})` : ""}</summary>
        <FilterFields {...props} />
      </details>
      {hydrated && (
        <dialog id="directory-filter-dialog" ref={dialog} className={styles.dialog} aria-labelledby="directory-filter-dialog-title"
          onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}>
          <div className={styles.dialogHeader}>
            <h2 id="directory-filter-dialog-title">Filtrovať služby</h2>
            <button type="button" className={styles.closeDialog} aria-label="Zavrieť filtre" onClick={() => dialog.current?.close()}>✕</button>
          </div>
          <FilterFields {...props} modal />
        </dialog>
      )}
      {activeSelections.length > 0 && (
        <div className={styles.activeFilters} aria-label="Aktívne filtre" data-directory-active-filters>
          <span className={styles.activeTitle}>Aktívne filtre</span>
          {activeSelections.map(({ key, label, value }) =>
            <Link className={styles.chip} key={key} href={clearOneHref(key)}
              aria-label={`Odstrániť filter ${label}: ${value}`}>
              <span>{label}: {value}</span><span aria-hidden="true">×</span>
            </Link>)}
          <Link className={styles.clearAll} href={basePath}>Vymazať všetko</Link>
        </div>
      )}
    </>
  );
}
