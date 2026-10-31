"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Fuse from "fuse.js";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";
import { adminNavigationGroups } from "@/lib/admin-navigation";
import styles from "./admin-quick-navigation.module.css";

type Destination = { label: string; category: string; href: string; keywords: string };

// Keep the regular sidebar as the single authority for main destinations.
// Only deeper, verified admin routes are added below for fast access.
const additionalDestinations: Destination[] = [
  { label: "Adopcie", category: "Pomoc psom", href: "/admin/adopcie", keywords: "adoptovať adopcia pes psi" },
  { label: "Stratené a nájdené psy", category: "Pomoc psom", href: "/admin/stratene-najdene", keywords: "strateny najdeny hladam psa" },
  { label: "Organizácie", category: "Pomoc psom", href: "/admin/organizacie", keywords: "utulky ochrana pomoc organizacia" },
  { label: "Katalóg služieb", category: "Služby pre psov", href: "/admin/sluzby-pre-psov/katalog", keywords: "veterinari treneri salony vlastnosti sluzby" },
  { label: "Nastavenia Notion", category: "Nastavenia", href: "/admin/nastavenia/notion", keywords: "notion synchronizacia sync polia diagnostika" },
];
const aliases: Record<string, string> = {
  "/admin/sluzby-pre-psov": "veterinari veterina veterinár salóny treneri fyzioterapia služby",
  "/admin/podujatia": "kalendar akcie podujatie vystavy seminare",
  "/admin/komponenty": "bannery sablony komponent znovupouzitie",
  "/admin/clanky": "novinky clanky obsah publikovanie",
  "/admin/plemena": "plemena psi labrador FCI",
  "/admin/facebook-obrazky": "grafiky prispevky facebook socialne siete",
  "/admin/kvalita": "kvalita dat kontrola AI opravy",
};
const destinations: Destination[] = [
  ...adminNavigationGroups.flatMap(group => group.items.map(item => ({
    label: item.label, category: group.label, href: item.href, keywords: aliases[item.href] ?? "",
  }))),
  ...additionalDestinations,
].filter((item, index, all) => all.findIndex(other => other.href === item.href) === index);

const search = new Fuse(destinations, {
  keys: [{ name: "label", weight: 0.6 }, { name: "category", weight: 0.2 }, { name: "keywords", weight: 0.2 }],
  threshold: 0.37,
  ignoreLocation: true,
  ignoreDiacritics: true,
});
const suggestedHrefs = new Set([
  "/admin/podujatia", "/admin/sluzby-pre-psov", "/admin/adopcie",
  "/admin/clanky", "/admin/nastavenia/notion", "/admin/komponenty",
]);

export function AdminQuickNavigation() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(current => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = query.trim()
    ? search.search(query.trim(), { limit: 12 }).map(match => match.item)
    : destinations.filter(item => suggestedHrefs.has(item.href));
  const selected = Math.min(active, Math.max(0, results.length - 1));

  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) { setQuery(""); setActive(0); }
  }
  function go(href: string) {
    changeOpen(false);
    router.push(href);
  }
  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActive(value => (value + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive(value => (value + results.length - 1) % results.length);
    } else if (event.key === "Enter" && results.length) {
      event.preventDefault();
      go(results[selected].href);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={styles.trigger} aria-label="Nájsť sekciu administrácie" data-admin-quick-nav-trigger>
          <Search size={16} aria-hidden="true" />
          <span>Nájsť sekciu</span>
          <kbd>Ctrl K</kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-admin-quick-navigation>
          <div className={styles.header}>
            <div>
              <Dialog.Title>Nájsť sekciu v administrácii</Dialog.Title>
              <Dialog.Description>Napíš názov alebo tému. Otvoríme priamo vybranú sekciu.</Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Zavrieť vyhľadávanie"><X size={18} /></Dialog.Close>
          </div>
          <div className={styles.searchRow}>
            <Search size={19} aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-label="Hľadať sekciu"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls="admin-quick-navigation-results"
              aria-activedescendant={results.length ? "admin-quick-nav-option-" + selected : undefined}
              value={query}
              onChange={event => { setQuery(event.target.value); setActive(0); }}
              onKeyDown={handleKeys}
              placeholder="Napr. veterinári, adopcie, Notion…"
            />
          </div>
          <div className={styles.results} id="admin-quick-navigation-results" role="listbox" aria-label="Dostupné sekcie">
            {results.length ? results.map((item, index) => (
              <button
                key={item.href}
                id={"admin-quick-nav-option-" + index}
                type="button"
                role="option"
                aria-selected={index === selected}
                data-active={index === selected ? "true" : undefined}
                className={styles.result}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(item.href)}
              >
                <span><strong>{item.label}</strong><small>{item.category}</small></span>
                <span className={styles.arrow} aria-hidden="true">↗</span>
              </button>
            )) : <p className={styles.empty}>Takúto sekciu som nenašiel. Skús iné slovo.</p>}
          </div>
          <div className={styles.footer}>↑ ↓ výber · Enter otvoriť · Esc zavrieť</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
