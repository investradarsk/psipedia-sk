"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SiteBreedMetric } from "@/lib/admin-site-category-report";
import styles from "./admin-site-category-panel.module.css";

const numberFormat = new Intl.NumberFormat("sk-SK");

export function AdminBreedViewsTable({ breeds }: { breeds: SiteBreedMetric[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"views" | "name">("views");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk-SK");
    const items = breeds.filter((breed) =>
      !needle || breed.name.toLocaleLowerCase("sk-SK").includes(needle));
    return items.sort((a, b) => sort === "views"
      ? b.views - a.views || a.name.localeCompare(b.name, "sk-SK")
      : a.name.localeCompare(b.name, "sk-SK"));
  }, [breeds, query, sort]);

  return (
    <div className={styles.breedSection}>
      <div className={styles.breedControls}>
        <label htmlFor="analytics-breed-search">
          Hľadať plemeno
          <input
            id="analytics-breed-search"
            type="search"
            placeholder="Názov plemena…"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label htmlFor="analytics-breed-sort">
          Zoradiť
          <select
            id="analytics-breed-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as "views" | "name")}
          >
            <option value="views">Najviac zobrazení</option>
            <option value="name">Abecedne</option>
          </select>
        </label>
      </div>
      <p className={styles.helper} role="status">
        Zobrazených {filtered.length} z {breeds.length} publikovaných plemien.
        Plemená bez návštev sú tiež v zozname.
      </p>
      <div className={styles.breedTableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Plemeno</th>
              <th scope="col">FCI</th>
              <th scope="col">Zobrazenia</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((breed) => (
              <tr key={breed.href}>
                <td><Link href={breed.href} target="_blank" rel="noopener noreferrer">{breed.name}</Link></td>
                <td>{breed.group}</td>
                <td className={styles.number}>{numberFormat.format(breed.views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className={styles.empty}>Nenašlo sa žiadne plemeno.</p>}
      </div>
    </div>
  );
}
