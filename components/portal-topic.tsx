import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { ArrowIcon, CheckIcon } from "@/components/icons";
import type { Article } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articlePortalSection, type PortalSection, type PortalSubpage } from "@/lib/portal";

const specialNotes: Record<string, { title: string; text: string; items: string[] }> = {
  "novinky/zachrana-a-hrdinovia": {
    title: "Príbehy, pri ktorých rozhodujú skutky",
    text: "Sledujeme záchranu psov zo zlých podmienok, úspešné adopcie aj prípady, keď pes pomohol zachrániť človeka. Uvádzame zdroj, miesto a aktuálny výsledok príbehu.",
    items: ["potvrdené informácie od organizácie alebo záchranných zložiek", "jasné oddelenie faktov od nepotvrdených tvrdení", "aktualizácia, keď sa situácia zmení"],
  },
  "novinky/veda-a-zdravie": {
    title: "Čo nový objav naozaj znamená",
    text: "Výskum, nové lieky a veterinárne postupy prekladáme do zrozumiteľnej reči. Vysvetlíme, či ide o prvé výsledky, schválenú liečbu alebo iba sľubný smer ďalšieho výskumu.",
    items: ["odkaz na pôvodný výskum alebo odbornú organizáciu", "rozlíšenie štúdie, schválenia a bežnej dostupnosti", "praktický význam bez falošných sľubov"],
  },
  "novinky/pracovne-psy": {
    title: "Psy, ktoré pomáhajú tam, kde ide o veľa",
    text: "Záchranárske, asistenčné, policajné aj detekčné psy pri katastrofách, pátraní a každodennej službe. Sledujeme ich prácu, výcvik aj konkrétny prínos.",
    items: ["zásahy a pátracie akcie", "asistenčné a detekčné schopnosti", "ľudia a organizácie za úspechom tímu"],
  },
  "novinky/ochrana-a-pravo": {
    title: "Pravidlá, ktoré menia život psov",
    text: "Nové zákony, rozsudky, kontroly chovov a opatrenia na ochranu zvierat vysvetlíme bez právnickej hmly — vrátane toho, odkedy platia a koho sa týkajú.",
    items: ["presný zdroj a dátum účinnosti", "dopad na majiteľov, chovateľov a organizácie", "vývoj závažných prípadov týrania"],
  },
  "adresar/treneri": {
    title: "Spojenie s trénerom cez Psipediu",
    text: "Pripravujeme overené profily trénerov podľa kraja a zamerania. Dopyt pôjde cez Psipediu, aby bol kontakt prehľadný a bezpečný.",
    items: ["výber podľa kraja a problému", "jasné zameranie a skúsenosti", "kontakt sprostredkovaný cez Psipediu"],
  },
  "podujatia/kalendar": {
    title: "Kalendár, v ktorom sa dá orientovať",
    text: "Termíny budeme triediť podľa dátumu, kraja a typu podujatia. Každé podujatie dostane samostatnú stránku s podmienkami a kontaktom.",
    items: ["výstavy, preteky a semináre", "dátum, miesto a organizátor", "odkaz na prihlásenie alebo propozície"],
  },
  "pomoc-psom/zbierky": {
    title: "Zverejňujeme iba overiteľnú pomoc",
    text: "Pri zbierkach bude uvedený organizátor, účel, cieľ, stav a spôsob overenia. Nejasné alebo anonymné výzvy nezverejníme.",
    items: ["identita organizátora", "konkrétny účel a transparentnosť", "označenie ukončenej zbierky"],
  },
  "pomoc-psom/nahlasit-psa-v-nudzi": {
    title: "Najprv bezpečnosť a správny kontakt",
    text: "Pri bezprostrednom ohrození alebo týraní kontaktuj políciu na čísle 158 alebo 112. Psipedia bude slúžiť ako rozcestník, nie ako náhrada záchranných zložiek.",
    items: ["bezpečne zdokumentovať situáciu", "uviesť presnú lokalitu a čas", "kontaktovať príslušnú autoritu alebo útulok"],
  },
};

export function PortalTopic({
  section,
  subpage,
  articles,
}: {
  section: PortalSection;
  subpage: PortalSubpage;
  articles: Article[];
}) {
  const newsCategory = section.slug === "novinky" ? getNewsCategory(subpage.slug) : null;
  const sectionArticles = articles.filter((article) =>
    articlePortalSection(article) === section.slug && (!newsCategory || article.newsCategory === newsCategory.slug),
  );
  const note = specialNotes[`${section.slug}/${subpage.slug}`] ?? {
    title: `Praktický prehľad: ${subpage.label}`,
    text: `${subpage.description} Obsah budeme rozširovať o overené informácie, konkrétne postupy a užitočné kontakty.`,
    items: ["zrozumiteľné vysvetlenie", "praktické kroky a odporúčania", "súvisiace články na jednej adrese"],
  };

  return (
    <main id="obsah">
      <header className={`portal-topic-hero portal-topic-hero--${section.accent}`}>
        <div className="shell">
          <nav className="article-breadcrumbs" aria-label="Navigácia">
            <Link href="/">Domov</Link><span>/</span><Link href={`/${section.slug}`}>{section.label}</Link><span>/</span><span>{subpage.label}</span>
          </nav>
          <span className="eyebrow">{section.eyebrow}</span>
          <h1>{subpage.label}</h1>
          <p>{subpage.description}</p>
        </div>
      </header>

      <section className="section shell portal-topic-body">
        <div className="portal-topic-copy">
          <span className="eyebrow">Čo tu nájdeš</span>
          <h2>{note.title}</h2>
          <p>{note.text}</p>
          <ul>
            {note.items.map((item) => <li key={item}><CheckIcon size={18} /><span>{item}</span></li>)}
          </ul>
        </div>
        <aside className="portal-topic-aside">
          <span aria-hidden="true">{section.icon}</span>
          <h3>{section.label}</h3>
          <p>{section.intro}</p>
          <Link href={`/${section.slug}`} className="text-link">Celá sekcia <ArrowIcon size={18} /></Link>
        </aside>
      </section>

      <section className="section section--tint">
        <div className="shell">
          <div className="section-heading split-heading">
            <div><span className="eyebrow">{newsCategory ? "Najnovšie správy" : "Súvisiace čítanie"}</span><h2>{newsCategory ? newsCategory.label : `Články zo sekcie ${section.label.toLocaleLowerCase("sk")}`}</h2></div>
            <Link href={newsCategory ? "/novinky" : "/clanky"} className="text-link text-link--large">{newsCategory ? "Všetky novinky" : "Všetky články"} <ArrowIcon /></Link>
          </div>
          {sectionArticles.length ? (
            <div className="article-grid">{sectionArticles.slice(0, 3).map((article) => <ArticleCard article={article} key={article.slug} />)}</div>
          ) : (
            <div className="portal-empty"><span aria-hidden="true">{newsCategory?.icon ?? "🐾"}</span><div><h3>{newsCategory ? "Prvú overenú správu pripravujeme" : "Obsah dopĺňame"}</h3><p>{newsCategory ? "Táto téma má vlastnú stálu adresu. Keď pribudne novinka, zobrazí sa tu spolu so zdrojom a dátumom aktualizácie." : "Táto podsekcia má vlastnú stálu adresu. Nové články sa sem budú pripájať cez redakčnú administráciu."}</p></div></div>
          )}
        </div>
      </section>
    </main>
  );
}
