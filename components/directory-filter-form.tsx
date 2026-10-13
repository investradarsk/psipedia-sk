"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { DirectoryCategorySlug } from "@/lib/directory";
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

export function DirectoryFilterForm({
  filters, options, basePath, category,
}: {
  filters: DirectoryFilters;
  options: PublicDirectoryProfilePage["options"];
  basePath: string;
  category?: DirectoryCategorySlug;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const districtRef = useRef<HTMLSelectElement>(null);
  const cityRef = useRef<HTMLSelectElement>(null);

  // No-JS fallback: filters remain open and usable as an ordinary GET form.
  // Once hydrated, use the native accessible disclosure on narrow screens.
  useEffect(() => {
    if (window.matchMedia("(max-width: 820px)").matches) details.current?.removeAttribute("open");
    formRef.current?.setAttribute("data-public-search-ready", "true");
  }, []);

  const activeCount = [
    filters.query, filters.region, filters.district, filters.city,
    filters.service, filters.breed, filters.fciGroup, filters.organization,
    filters.profileType, filters.sort !== "recommended" ? filters.sort : "",
  ].filter(Boolean).length;

  const applyParentFilter = (level: "region" | "district") => {
    if (level === "region" && districtRef.current) districtRef.current.value = "";
    if (cityRef.current) cityRef.current.value = "";
    formRef.current?.requestSubmit();
  };

  return (
    <details className={styles.disclosure} ref={details} open data-directory-filter-disclosure>
      <summary className={styles.summary}>Filtre{activeCount > 0 ? ` (${activeCount})` : ""}</summary>
      <form
        ref={formRef}
        className={styles.sidebarForm}
        action={basePath}
        method="get"
        data-directory-filter-form
        aria-label="Filtrovať služby pre psov"
      >
        {directoryQueryFields(filters, ["region", "district", "city", "service", "breed", "fci", "organization", "type", "sort", "page"]).map((field) =>
          <input type="hidden" name={field.name} value={field.value} key={field.name} />)}
        <div className={styles.heading}>
          <strong>Spresniť výsledky</strong>
          {activeCount > 0 && <span>{activeCount} aktívnych</span>}
        </div>
        <label><span>Kraj</span><select name="region" defaultValue={filters.region} onChange={() => applyParentFilter("region")}>
          <option value="">Všetky kraje</option>{options.regions.map((item) => <option value={item} key={item}>{item}</option>)}
        </select></label>
        <label><span>Okres</span><select ref={districtRef} name="district" defaultValue={filters.district} onChange={() => applyParentFilter("district")}>
          <option value="">Všetky okresy</option>{options.districts.map((item) => <option value={item} key={item}>{item}</option>)}
        </select></label>
        <label><span>Mesto/obec</span><select ref={cityRef} name="city" defaultValue={filters.city}>
          <option value="">Všetky mestá a obce</option>{options.cities.map((item) => <option value={item} key={item}>{item}</option>)}
        </select></label>
        {options.services.length > 0 &&
          <label><span>{serviceLabels[category ?? filters.category] ?? "Služba / zameranie"}</span><select name="service" defaultValue={filters.service}>
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
        <label><span>Zoradenie</span><select name="sort" defaultValue={filters.sort}>
          <option value="recommended">Odporúčané</option><option value="name-asc">Názov A–Z</option>
          <option value="name-desc">Názov Z–A</option><option value="newest">Najnovšie</option>
        </select></label>
        <button className={styles.submit} type="submit">Použiť filtre</button>
        <Link className={styles.clear} href={basePath}>Zrušiť filtre</Link>
      </form>
    </details>
  );
}
