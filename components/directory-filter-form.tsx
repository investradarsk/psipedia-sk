"use client";

import Link from "next/link";
import { useRef } from "react";
import { SearchIcon } from "@/components/icons";
import { directoryCategories, type DirectoryCategorySlug } from "@/lib/directory";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";

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

export function DirectoryFilterForm({ filters, options, basePath, category, showCategory }: {
  filters: DirectoryFilters;
  options: PublicDirectoryProfilePage["options"];
  basePath: string;
  category?: DirectoryCategorySlug;
  showCategory?: boolean;
}) {
  const activeCategory = (category ?? filters.category) || "dalsie-sluzby";
  const formRef = useRef<HTMLFormElement>(null);
  const districtRef = useRef<HTMLSelectElement>(null);
  const cityRef = useRef<HTMLSelectElement>(null);
  const dependentSubmit = (level: "region" | "district") => {
    if (level === "region" && districtRef.current) districtRef.current.value = "";
    if (cityRef.current) cityRef.current.value = "";
    formRef.current?.requestSubmit();
  };
  return (
    <details className="directory-filter-panel" open>
      <summary>Filtre</summary>
      <form ref={formRef} className="directory-toolbar" method="get" action={basePath}>
        <label className="directory-search"><span>Vyhľadávanie</span><div><SearchIcon size={19} /><input name="q" defaultValue={filters.query} placeholder="Názov, služba, plemeno alebo lokalita" /></div></label>
        {showCategory && <label><span>Kategória</span><select name="category" defaultValue={filters.category}><option value="">Všetky služby</option>{directoryCategories.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}</select></label>}
        <label><span>Kraj</span><select name="region" defaultValue={filters.region} onChange={() => dependentSubmit("region")}><option value="">Všetky kraje</option>{options.regions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>Okres</span><select ref={districtRef} name="district" defaultValue={filters.district} disabled={Boolean(filters.region) && options.districts.length === 0} onChange={() => dependentSubmit("district")}><option value="">Všetky okresy</option>{options.districts.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>Mesto/obec</span><select ref={cityRef} name="city" defaultValue={filters.city}><option value="">Všetky mestá a obce</option>{options.cities.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        {options.services.length > 0 && <label><span>{serviceLabels[activeCategory] ?? "Služba / zameranie"}</span><select name="service" defaultValue={filters.service}><option value="">Všetky možnosti</option>{options.services.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>}
        {options.breeds.length > 0 && <label><span>Plemeno</span><select name="breed" defaultValue={filters.breed}><option value="">Všetky plemená</option>{options.breeds.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>}
        {options.fciGroups.length > 0 && <label><span>FCI skupina</span><select name="fci" defaultValue={filters.fciGroup}><option value="">Všetky FCI skupiny</option>{options.fciGroups.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>}
        {options.organizations.length > 0 && <label><span>Organizácia</span><select name="organization" defaultValue={filters.organization}><option value="">Všetky organizácie</option>{options.organizations.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>}
        {options.profileTypes.length > 0 && <label><span>Typ služby</span><select name="type" defaultValue={filters.profileType}><option value="">Všetky typy</option>{options.profileTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>}
        <label><span>Zoradenie</span><select name="sort" defaultValue={filters.sort}><option value="recommended">Odporúčané</option><option value="name-asc">Názov A–Z</option><option value="name-desc">Názov Z–A</option><option value="newest">Najnovšie</option></select></label>
        <div className="directory-filter-actions"><button type="submit">Zobraziť výsledky</button><Link href={basePath}>Zrušiť filtre</Link></div>
      </form>
    </details>
  );
}
