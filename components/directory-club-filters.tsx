"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/icons";
import { directoryClubSortOptions, type DirectoryClubSearchParams } from "@/lib/directory";

type Props = {
  current: DirectoryClubSearchParams;
  regions: string[];
  districts: string[];
  cities: string[];
};

function searchHref(values: DirectoryClubSearchParams) {
  const query = new URLSearchParams();
  if (values.q) query.set("q", values.q);
  if (values.region) query.set("region", values.region);
  if (values.district) query.set("district", values.district);
  if (values.city) query.set("city", values.city);
  if (values.sort !== "name-asc") query.set("sort", values.sort);
  if (values.page > 1) query.set("page", String(values.page));
  const suffix = query.toString();
  return `/adresar/kynologicke-kluby${suffix ? `?${suffix}` : ""}`;
}

export function DirectoryClubFilters({ current, regions, districts, cities }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(current.q);

  function navigate(next: Partial<DirectoryClubSearchParams>) {
    router.push(searchHref({ ...current, ...next, page: 1 }));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: query.trim() });
  }

  return (
    <div className="directory-club-filter-panel">
      <form className="directory-club-search" onSubmit={submitSearch} role="search">
        <label className="directory-search">
          <span>Hľadať kluby</span>
          <div><SearchIcon size={19} /><input name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov, mesto, okres alebo kraj" /></div>
        </label>
        <button type="submit">Hľadať</button>
      </form>
      <div className="directory-club-selects">
        <label><span>Kraj</span><select value={current.region} onChange={(event) => navigate({ region: event.target.value, district: "", city: "" })}><option value="">Všetky kraje</option>{regions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Okres</span><select value={current.district} onChange={(event) => navigate({ district: event.target.value, city: "" })}><option value="">Všetky okresy</option>{districts.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Mesto / obec</span><select value={current.city} onChange={(event) => navigate({ city: event.target.value })}><option value="">Všetky mestá a obce</option>{cities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Zoradenie</span><select value={current.sort} onChange={(event) => navigate({ sort: event.target.value as DirectoryClubSearchParams["sort"] })}>{directoryClubSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      {(current.q || current.region || current.district || current.city || current.sort !== "name-asc") && <Link className="directory-club-reset" href="/adresar/kynologicke-kluby">Zrušiť filtre</Link>}
    </div>
  );
}
