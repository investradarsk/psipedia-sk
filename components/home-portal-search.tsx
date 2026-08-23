"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowIcon, SearchIcon } from "@/components/icons";

export type HomeSearchItem = {
  href: string;
  title: string;
  type: string;
  keywords?: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .trim();
}

export function HomePortalSearch({ items }: { items: HomeSearchItem[] }) {
  const [query, setQuery] = useState("");
  const needle = normalize(query);
  const matches = useMemo(() => {
    if (needle.length < 2) return [];
    return items
      .filter((item) => normalize(`${item.title} ${item.type} ${item.keywords ?? ""}`).includes(needle))
      .slice(0, 6);
  }, [items, needle]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (matches[0]) window.location.assign(matches[0].href);
  }

  return (
    <section className="home-search-panel" aria-label="Vyhľadávanie na Psipedii">
      <div className="home-search-copy">
        <span>Čo potrebuješ vyriešiť?</span>
        <strong>Jedno miesto pre celý život so psom</strong>
      </div>
      <div className="home-search-main">
        <form onSubmit={submit} className="home-search-form" role="search">
          <SearchIcon size={23} />
          <label className="sr-only" htmlFor="home-search">Hľadať na Psipedii</label>
          <input
            id="home-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Skús „šteniatko“, „labrador“, „tréner“..."
            autoComplete="off"
          />
          <button type="submit" disabled={!matches.length}>Nájsť</button>
        </form>
        {needle.length >= 2 && (
          <div className="home-search-results" aria-live="polite">
            {matches.length ? matches.map((item) => (
              <Link href={item.href} key={`${item.type}-${item.href}`}>
                <span>{item.type}</span>
                <strong>{item.title}</strong>
                <ArrowIcon size={17} />
              </Link>
            )) : <p>Nič presné sme nenašli. Skús kratšie alebo všeobecnejšie slovo.</p>}
          </div>
        )}
        <div className="home-search-shortcuts" aria-label="Obľúbené vyhľadávania">
          <span>Rýchlo:</span>
          <Link href="/steniatka/prve-dni">Prvé dni doma</Link>
          <Link href="/plemena">Plemená</Link>
          <Link href="/adresar/treneri">Tréneri</Link>
          <Link href="/podujatia">Podujatia</Link>
        </div>
      </div>
    </section>
  );
}
