import Link from "next/link";
import { SearchIcon } from "@/components/icons";

export function HomePortalSearch() {
  return (
    <section className="home-search-panel" aria-label="Vyhľadávanie na Psipedii">
      <div className="home-search-copy">
        <span>Čo potrebuješ vyriešiť?</span>
        <strong>Jedno miesto pre celý život so psom</strong>
      </div>
      <div className="home-search-main">
        <form action="/hladat" method="get" className="home-search-form" role="search">
          <SearchIcon size={23} />
          <label className="sr-only" htmlFor="home-search">Hľadať na Psipedii</label>
          <input
            id="home-search"
            name="q"
            placeholder="Skús „šteniatko“, „labrador“, „tréner“..."
            autoComplete="off"
            minLength={2}
            maxLength={120}
            required
          />
          <button type="submit">Nájsť všetko</button>
        </form>
        <div className="home-search-shortcuts" aria-label="Rýchle vstupy">
          <span>Rýchlo:</span>
          <Link href="/adresar">Služby</Link>
          <Link href="/plemena">Plemená</Link>
          <Link href="/podujatia">Podujatia</Link>
          <Link href="/pomoc-psom">Pomoc psom</Link>
        </div>
      </div>
    </section>
  );
}
