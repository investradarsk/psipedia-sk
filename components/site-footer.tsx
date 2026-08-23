import Link from "next/link";
import { PawMark } from "./icons";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main shell">
        <div className="footer-brand-block">
          <Link href="/" className="brand brand--footer" aria-label="Psipedia.sk – domov">
            <span className="brand-mark"><PawMark size={29} /></span>
            <span>psi<span>pedia</span><small>.sk</small></span>
          </Link>
          <p>Slovenský portál pre celý život so psom.</p>
        </div>
        <div className="footer-links">
          <div>
            <strong>Začíname spolu</strong>
            <Link href="/steniatka">Šteniatka</Link>
            <Link href="/plemena">Plemená</Link>
            <Link href="/starostlivost">Starostlivosť</Link>
            <Link href="/aktivity">Aktivity a športy</Link>
          </div>
          <div>
            <strong>Portál</strong>
            <Link href="/novinky">Novinky</Link>
            <Link href="/podujatia">Podujatia</Link>
            <Link href="/adresar">Adresár</Link>
            <Link href="/pomoc-psom">Pomoc psom</Link>
            <Link href="/recenzie">Recenzie</Link>
          </div>
          <div>
            <strong>Psipedia</strong>
            <Link href="/clanky">Všetky články</Link>
            <Link href="/oblubene">Obľúbené</Link>
            <Link href="/o-nas">O nás</Link>
            <Link href="/zasady-obsahu">Zásady obsahu</Link>
          </div>
          <div>
            <strong>Právne</strong>
            <Link href="/pravne-informacie">Prevádzkovateľ</Link>
            <Link href="/sukromie">Ochrana údajov</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/podmienky-pouzivania">Podmienky používania</Link>
            <Link href="/opravy-a-podnety">Opravy a podnety</Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom shell">
        <span>© {new Date().getFullYear()} Psipedia.sk</span>
        <span>Vytvorené pre ľudí, ktorí chcú svojim psom rozumieť. <Link href="/pravne-informacie">Právne informácie</Link></span>
      </div>
    </footer>
  );
}
