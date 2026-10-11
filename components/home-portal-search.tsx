import Link from "next/link";
import { SearchIcon } from "@/components/icons";

export function HomePortalSearch({
  action = "/hladat",
  id = "home-search",
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
  return (
    <section className="home-search-panel" aria-label={panelLabel}>
      <div className="home-search-copy">
        <span>{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      <div className="home-search-main">
        <form action={action} method="get" className="home-search-form" role="search" data-public-search-form={searchScope}>
          {hidden.map((field) => <input type="hidden" name={field.name} value={field.value} key={field.name} />)}
          <SearchIcon size={23} />
          <label className="sr-only" htmlFor={id}>{label}</label>
          <input
            id={id}
            name="q"
            placeholder={placeholder}
            defaultValue={defaultValue}
            autoComplete="off"
            minLength={allowEmpty ? undefined : 2}
            maxLength={120}
            required={!allowEmpty}
          />
          <button type="submit">{buttonLabel}</button>
        </form>
        <div className="home-search-shortcuts" aria-label="Rýchle vstupy">
          <span>Rýchlo:</span>
          {shortcuts.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </div>
      </div>
    </section>
  );
}
