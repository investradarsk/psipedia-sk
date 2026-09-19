import type { Metadata } from "next";
import Link from "next/link";
import {
  EDITORIAL_EMAIL_ADDRESS,
  PUBLIC_OPERATOR_ADDRESS,
  PUBLIC_OPERATOR_NAME,
} from "@/lib/public-contact";
import { buildPageMetadata } from "@/lib/seo";
import styles from "./contact.module.css";

export const metadata: Metadata = buildPageMetadata({
  title: "Kontakt",
  description: "Kontakt na Psipedia.sk pre otázky, podnety, opravy, služby, pomoc psom a spoluprácu.",
  path: "/kontakt",
});

const generalQuestionHref = `mailto:${EDITORIAL_EMAIL_ADDRESS}?subject=${encodeURIComponent("Všeobecná otázka – Psipedia.sk")}`;
const collaborationHref = `mailto:${EDITORIAL_EMAIL_ADDRESS}?subject=${encodeURIComponent("Spolupráca – Psipedia.sk")}`;
const missingServiceHref = `mailto:${EDITORIAL_EMAIL_ADDRESS}?subject=${encodeURIComponent("Doplnenie služby – Psipedia.sk")}`;

export default function ContactPage() {
  return (
    <main id="obsah" className={styles.page}>
      <header className={styles.hero}>
        <div className={`shell ${styles.heroShell}`}>
          <nav className={styles.breadcrumbs} aria-label="Navigácia">
            <Link href="/">Domov</Link>
            <span aria-hidden="true">/</span>
            <span>Kontakt</span>
          </nav>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className="eyebrow">Kontakt Psipedia.sk</span>
              <h1>Ako ti môžeme pomôcť?</h1>
              <p>
                Vyber tému, ktorá najlepšie vystihuje tvoju správu. Ak už pre daný typ podnetu existuje
                samostatný postup, pošleme ťa priamo tam — vďaka tomu sa správa dostane na správne miesto.
              </p>
            </div>

            <aside className={styles.emailPanel} aria-label="Všeobecný kontakt">
              <span>Všeobecný kontakt</span>
              <strong>{EDITORIAL_EMAIL_ADDRESS}</strong>
              <p>Ak si nie si istý, kam správa patrí, napíš redakcii priamo e-mail.</p>
              <a data-contact-action href={generalQuestionHref}>Napísať e-mail</a>
            </aside>
          </div>
        </div>
      </header>

      <section className={`shell ${styles.routeSection}`} aria-labelledby="contact-routes-title">
        <div className={styles.sectionHeading}>
          <span className="eyebrow">Správna cesta</span>
          <h2 id="contact-routes-title">Vyber, s čím sa ozývaš</h2>
          <p>Kontakt neslúži ako druhý inbox pre podnety, ktoré už majú vlastný bezpečný workflow.</p>
        </div>

        <div className={styles.routeGrid} data-contact-routes>
          <a className={styles.routeCard} data-contact-route="general" data-contact-action href={generalQuestionHref}>
            <span className={styles.routeKicker}>Všeobecne</span>
            <h3>Všeobecná otázka</h3>
            <p>Otázka k Psipedii, obsahu alebo fungovaniu portálu, ktorá nepatrí do špecializovaného formulára.</p>
            <strong className={styles.routeAction}>Napísať redakcii →</strong>
          </a>

          <Link className={styles.routeCard} data-contact-route="content-error" data-contact-action href="/opravy-a-podnety">
            <span className={styles.routeKicker}>Obsah</span>
            <h3>Chyba alebo neaktuálny údaj</h3>
            <p>Preklep, nefunkčný odkaz, nesprávny odborný údaj alebo údaj, ktorý treba preveriť.</p>
            <strong className={styles.routeAction}>Opravy a podnety →</strong>
          </Link>

          <Link className={styles.routeCard} data-contact-route="news-tip" data-contact-action href="/novinky/poslat-tip">
            <span className={styles.routeKicker}>Redakcia</span>
            <h3>Tip na novinku</h3>
            <p>Príbeh, výskum, záchrana, projekt alebo udalosť zo sveta psov patrí do redakčného News Tip flow.</p>
            <strong className={styles.routeAction}>Poslať tip →</strong>
          </Link>

          <Link className={styles.routeCard} data-contact-route="directory-inquiry" data-contact-action href="/adresar">
            <span className={styles.routeKicker}>Služby pre psov</span>
            <h3>Dopyt pre konkrétnu službu</h3>
            <p>Nájdi službu v adresári, otvor jej profil a použi sekciu „Poslať dopyt“ priamo na profile.</p>
            <strong className={styles.routeAction}>Otvoriť adresár →</strong>
          </Link>

          <Link className={styles.routeCard} data-contact-route="directory-change" data-contact-action href="/adresar">
            <span className={styles.routeKicker}>Údaje profilu</span>
            <h3>Zmena existujúceho profilu</h3>
            <p>Nájdi svoj profil služby a použi „Navrhnúť úpravu profilu“. Návrh prejde samostatnou kontrolou.</p>
            <strong className={styles.routeAction}>Nájsť profil →</strong>
          </Link>

          <a className={styles.routeCard} data-contact-route="missing-service" data-contact-action href={missingServiceHref}>
            <span className={styles.routeKicker}>Nový záznam</span>
            <h3>Služba v adresári chýba</h3>
            <p>Ak profil ešte neexistuje, pošli redakcii základné údaje a odkaz na oficiálny zdroj.</p>
            <strong className={styles.routeAction}>Navrhnúť doplnenie →</strong>
          </a>

          <Link className={styles.routeCard} data-contact-route="help" data-contact-action href="/pomoc-psom/nahlasit-psa-v-nudzi">
            <span className={styles.routeKicker}>Pomoc psom</span>
            <h3>Stratený, nájdený alebo ohrozený pes</h3>
            <p>Použi príslušný Help postup. Pri bezprostrednom ohrození nečakaj na odpoveď redakcie.</p>
            <strong className={styles.routeAction}>Otvoriť postup pomoci →</strong>
          </Link>

          <a className={styles.routeCard} data-contact-route="collaboration" data-contact-action href={collaborationHref}>
            <span className={styles.routeKicker}>Partnerstvo</span>
            <h3>Spolupráca</h3>
            <p>Redakčná, odborná alebo projektová spolupráca, ktorá nesúvisí s opravou konkrétneho profilu.</p>
            <strong className={styles.routeAction}>Napísať o spolupráci →</strong>
          </a>
        </div>
      </section>

      <section className={`shell ${styles.urgentSection}`} aria-labelledby="urgent-contact-title" data-contact-urgent>
        <div className={styles.urgentCopy}>
          <span className={styles.urgentMark} aria-hidden="true">!</span>
          <div>
            <span className="eyebrow">Keď rozhodujú minúty</span>
            <h2 id="urgent-contact-title">Ak ide o akútny problém so psom</h2>
            <p>
              Psipedia.sk nie je veterinárna pohotovosť ani tiesňová služba. Pri ohrození zdravia alebo života psa
              kontaktuj veterinára alebo príslušnú zložku pomoci.
            </p>
          </div>
        </div>
        <div className={styles.urgentActions}>
          <Link data-contact-action href="/adresar/veterinari">Nájsť veterinára</Link>
          <Link data-contact-action href="/pomoc-psom/nahlasit-psa-v-nudzi">Postup pri psovi v núdzi</Link>
        </div>
      </section>

      <section className={`shell ${styles.infoGrid}`}>
        <article className={styles.infoCard}>
          <span className="eyebrow">Prevádzkovateľ</span>
          <h2>Kontaktné údaje</h2>
          <dl>
            <div>
              <dt>Meno</dt>
              <dd>{PUBLIC_OPERATOR_NAME}</dd>
            </div>
            <div>
              <dt>Adresa</dt>
              <dd>{PUBLIC_OPERATOR_ADDRESS}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd><a className={styles.longText} href={`mailto:${EDITORIAL_EMAIL_ADDRESS}`}>{EDITORIAL_EMAIL_ADDRESS}</a></dd>
            </div>
          </dl>
        </article>

        <article className={styles.infoCard}>
          <span className="eyebrow">Súkromie a pravidlá</span>
          <h2>Pred odoslaním osobných údajov</h2>
          <p>Posielaj iba údaje potrebné na vybavenie tvojej správy a použi existujúci špecializovaný formulár, ak je pre daný účel dostupný.</p>
          <div className={styles.legalLinks}>
            <Link data-contact-action href="/sukromie">Ochrana osobných údajov</Link>
            <Link data-contact-action href="/pravne-informacie">Prevádzkovateľ a právne informácie</Link>
          </div>
        </article>
      </section>
    </main>
  );
}
