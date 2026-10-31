"use client";

import { useRef, useState } from "react";
import { PublicSearchSuggestions } from "./public-search-suggestions";
import { PublicTextInput } from "@/components/public-visual-system/public-form-controls";
import Link from "next/link";
import { SearchIcon } from "@/components/icons";

export function HomePortalSearch({
  action = "/hladat",
  id = "home-search",
  inputName = "q",
  label = "Hľadať na Psipedii",
  panelLabel = "Vyhľadávanie na Psipedii",
  eyebrow = "Čo potrebuješ vyriešiť?",
  title = "Jedno miesto pre celý život so psom",
  placeholder = "Skús „šteniatko“, „labrador“, „tréner“...",
  buttonLabel = "Nájsť všetko",
  defaultValue = "",
  allowEmpty = false,
  hidden = [],
  shortcuts = [
    { href: "/adresar", label: "Služby" },
    { href: "/plemena", label: "Plemená" },
    { href: "/podujatia", label: "Podujatia" },
    { href: "/pomoc-psom", label: "Pomoc psom" },
  ],
  searchScope,
}: {
  action?: string;
  id?: string;
  inputName?: string;
  label?: string;
  panelLabel?: string;
  eyebrow?: string;
  title?: string;
  placeholder?: string;
  buttonLabel?: string;
  defaultValue?: string;
  allowEmpty?: boolean;
  hidden?: Array<{ name: string; value: string }>;
  shortcuts?: Array<{ href: string; label: string }>;
  searchScope?: string;
} = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [liveQuery, setLiveQuery] = useState(defaultValue);
  // Do not change section-scoped GET search (services, help, events, reviews).
  const enableSuggestions = action === "/hladat" && !searchScope && inputName === "q" && hidden.length === 0;
  return (
    <section className="home-search-panel" aria-label={panelLabel}>
      <div className="home-search-copy">
        <span>{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      <div className="home-search-main">
        <form action={action} method="get" className="home-search-form" role="search" data-public-search-form={searchScope} data-public-search-ui="main">
          {hidden.map((field) => <input type="hidden" name={field.name} value={field.value} key={field.name} />)}
          <span className="public-search-entry">
            <span className="public-search-icon" aria-hidden="true"><SearchIcon size={21} /></span>
            <label className="sr-only" htmlFor={id}>{label}</label>
            <PublicTextInput appearance="context"
            id={id}
            name={inputName}
            placeholder={placeholder}
            defaultValue={defaultValue}
            ref={inputRef}
            role={enableSuggestions ? "combobox" : undefined}
            onChange={(event) => setLiveQuery(event.target.value)
            autoComplete="off"
            minLength={allowEmpty ? undefined : 2}
            maxLength={120}
            required={!allowEmpty}
            />
          </span>
          <button type="submit">{buttonLabel}</button>
        </form>
        <PublicSearchSuggestions
          query={liveQuery}
          enabled={enableSuggestions}
          mode="home"
          inputRef={inputRef}
        />
        {shortcuts.length > 0 && (
          <div className="home-search-shortcuts" aria-label="Rýchle vstupy">
            <span>Rýchlo:</span>
            {shortcuts.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
          </div>
        )}
      </div>
    </section>
  );
}
