import Link from "next/link";
import { PawMark } from "./icons";
import { CookieSettingsButton } from "./cookie-consent";
import { EDITORIAL_EMAIL_ADDRESS } from "@/lib/public-contact";
import { SOCIAL_PROFILES } from "@/lib/seo";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={`site-footer ${styles.compactFooter}`}>
      <div className="footer-main shell">
        <div className="footer-brand-block">
          <Link prefetch={false} href="/" className="brand brand--footer" aria-label="Psipedia.sk – domov">
            <span className="brand-mark"><PawMark size={29} /></span>
            <span>psi<span>pedia</span><small>.sk</small></span>
          </Link>
          <p>Slovenský portál pre celý život so psom.</p>
        </div>
        <div className="footer-links">
          <div>
            <strong>Začíname spolu</strong>
            <Link prefetch={false} href="/steniatka">Šteniatka</Link>
            <Link prefetch={false} href="/plemena">Plemená</Link>
            <Link prefetch={false} href="/starostlivost">Starostlivosť</Link>
            <Link prefetch={false} href="/aktivity">Aktivity a športy</Link>
          </div>
          <div>
            <strong>Portál</strong>
            <Link prefetch={false} href="/novinky">Novinky</Link>
            <Link prefetch={false} href="/podujatia">Podujatia</Link>
            <Link prefetch={false} href="/adresar">Služby pre psov</Link>
            <Link prefetch={false} href="/pomoc-psom">Pomoc psom</Link>
            <Link prefetch={false} href="/recenzie">Recenzie a testy</Link>
          </div>
          <div>
            <strong>Psipedia</strong>
            <Link prefetch={false} href="/oblubene">Obľúbené</Link>
            <Link prefetch={false} href="/o-nas">O nás</Link>
            <Link prefetch={false} href="/zasady-obsahu">Zásady obsahu</Link>
            <a href={SOCIAL_PROFILES.facebook} rel="me">Facebook</a>
            <a href={SOCIAL_PROFILES.instagram} rel="me">Instagram</a>
          </div>
          <div>
            <strong>Právne a kontakt</strong>
            <Link prefetch={false} href="/kontakt">Kontakt</Link>
            <a href={`mailto:${EDITORIAL_EMAIL_ADDRESS}`}>{EDITORIAL_EMAIL_ADDRESS}</a>
            <Link prefetch={false} href="/pravne-informacie">Prevádzkovateľ</Link>
            <Link prefetch={false} href="/sukromie">Ochrana osobných údajov</Link>
            <CookieSettingsButton />
            <Link prefetch={false} href="/podmienky-pouzivania">Podmienky používania</Link>
            <Link prefetch={false} href="/opravy-a-podnety">Opravy a podnety</Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom shell">
        <span>© {new Date().getFullYear()} Psipedia.sk</span>
        <span>Vytvorené pre ľudí, ktorí chcú svojim psom rozumieť. <Link prefetch={false} href="/pravne-informacie">Právne informácie</Link></span>
      </div>
    </footer>
  );
}
