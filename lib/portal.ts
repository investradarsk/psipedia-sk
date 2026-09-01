import type { Article } from "@/lib/content";
import { newsCategories } from "@/lib/news";

export const articlePortalSectionSlugs = [
  "clanky",
  "novinky",
  "steniatka",
  "starostlivost",
  "aktivity",
  "podujatia",
  "adresar",
  "pomoc-psom",
  "recenzie",
] as const;

export type ArticlePortalSection = (typeof articlePortalSectionSlugs)[number];

export type PortalSubpage = {
  slug: string;
  label: string;
  description: string;
  intro?: string;
  icon?: string;
  imageUrl?: string;
  imageAlt?: string;
  href?: string;
  visible?: boolean;
  popularTopics?: string[];
  commonQuestions?: string[];
  homeSteps?: string[];
  warningSigns?: string[];
  expertAdvice?: string;
  serviceLinks?: { label: string; href: string }[];
  featuredArticleSlugs?: string[];
  seoTitle?: string;
  metaDescription?: string;
};

export type PortalSection = {
  slug: string;
  label: string;
  navLabel?: string;
  icon: string;
  accent: "forest" | "coral" | "gold" | "blue";
  eyebrow: string;
  description: string;
  intro: string;
  subpages: PortalSubpage[];
  articleEnabled: boolean;
};

export const portalSections: PortalSection[] = [
  {
    slug: "novinky",
    label: "Novinky",
    navLabel: "Novinky",
    icon: "🗞️",
    accent: "blue",
    eyebrow: "Psí svet práve teraz",
    description: "Silné príbehy, dôležité zmeny a overené správy zo sveta psov na jednom mieste.",
    intro: "Sledujeme záchranu psov, hrdinské zásahy, vedu, nové lieky, zákony aj udalosti, ktoré majú skutočný dosah. Každú správu zasadíme do súvislostí a uvedieme jej zdroj.",
    articleEnabled: true,
    subpages: [
      ...newsCategories.map((category) => ({
        slug: category.slug,
        label: category.label,
        description: category.description,
      })),
      { slug: "poslat-tip", label: "Pošli tip redakcii", description: "Upozorni nás na silný príbeh, výskum alebo dôležitú udalosť.", href: "/novinky/poslat-tip" },
    ],
  },
  {
    slug: "steniatka",
    label: "Šteniatka",
    icon: "🐶",
    accent: "coral",
    eyebrow: "Dobrý začiatok",
    description: "Od rozhodnutia až po prvý rok: pokojný a praktický sprievodca životom so šteniatkom.",
    intro: "Prvé mesiace formujú zdravie, vzťah aj budúce správanie psa. Tu nájdeš postupy zoradené podľa toho, čo práve riešiš.",
    articleEnabled: true,
    subpages: [
      { slug: "pred-kupou-psa", label: "Pred kúpou psa", description: "Rozhodnutie, pripravenosť domácnosti, čas, náklady a zodpovednosť." },
      { slug: "vyber-plemena", label: "Výber plemena", description: "Povaha, veľkosť, aktivita a potreby plemena podľa tvojho života." },
      { slug: "vyber-chovatela", label: "Výber chovateľa", description: "Ako spoznať zodpovedný chov, overiť zdravie rodičov a vyhnúť sa množiteľom." },
      { slug: "prve-dni", label: "Prvé dni doma", description: "Režim, spánok, čistotnosť a pokojné zoznámenie s domácnosťou." },
      { slug: "socializacia", label: "Socializácia", description: "Dobré skúsenosti s ľuďmi, psami, prostredím a manipuláciou." },
      { slug: "hygiena", label: "Hygiena", description: "Čistotnosť, srsť, pazúry, zuby, uši a pokojná manipulácia." },
      { slug: "krmenie", label: "Kŕmenie", description: "Dávka, režim, zmena krmiva a sledovanie zdravej kondície." },
      { slug: "ockovanie-a-zdravie", label: "Očkovanie a zdravie", description: "Očkovanie, odčervenie, prevencia a situácie, keď volať veterinára." },
      { slug: "vycvik-steniatka", label: "Výcvik šteniatka", description: "Meno, privolanie, vodítko a základy spolupráce bez nátlaku." },
      { slug: "rast-a-vyvoj", label: "Rast a vývoj", description: "Vývoj tela a správania, výmena zubov, pohyb a primerané zaťaženie." },
      { slug: "puberta", label: "Puberta", description: "Zmeny správania, hranice, emócie a tréning počas dospievania." },
    ],
  },
  {
    slug: "plemena",
    label: "Plemená",
    icon: "🐕",
    accent: "forest",
    eyebrow: "Atlas FCI",
    description: "Charakter, potreby a reálny život s plemenami zo všetkých desiatich skupín FCI.",
    intro: "Porovnaj si povahu, aktivitu, veľkosť aj nároky a vyberaj podľa svojho života, nie iba podľa vzhľadu.",
    articleEnabled: false,
    subpages: [
      { slug: "atlas", label: "Atlas plemien", description: "Prehľad plemien podľa medzinárodného členenia FCI.", href: "/plemena" },
      { slug: "porovnanie", label: "Porovnať plemená", description: "Dve plemená vedľa seba podľa praktických vlastností.", href: "/porovnat-plemena" },
      { slug: "vyber-plemena", label: "Ako vybrať plemeno", description: "Otázky, ktoré si položiť ešte pred rozhodnutím." },
      { slug: "kluby-plemien", label: "Kluby plemien", description: "Organizácie zastrešujúce konkrétne plemená na Slovensku.", href: "/adresar/chovatelske-kluby" },
    ],
  },
  {
    slug: "starostlivost",
    label: "Zdravie a starostlivosť",
    icon: "🩺",
    accent: "blue",
    eyebrow: "Každodenná poradňa",
    description: "Zdravie, výživa, výcvik aj správanie vysvetlené v súvislostiach.",
    intro: "Vyber si oblasť a nájdi zrozumiteľný postup, varovné signály aj hranicu, kedy už patrí problém odborníkovi.",
    articleEnabled: true,
    subpages: [
      {
        slug: "zdravie", label: "Zdravie", icon: "🩺", description: "Prevencia, príznaky, prvá pomoc a návšteva veterinára.",
        intro: "Zorientuj sa v príznakoch, priprav sa na telefonát veterinárovi a rozpoznaj situácie, pri ktorých sa neoplatí čakať.",
        popularTopics: ["Kedy ísť k veterinárovi", "Hnačka a vracanie", "Kliešte a parazity", "Prvá pomoc"],
        commonQuestions: ["Ktoré príznaky vyžadujú okamžité vyšetrenie?", "Čo si pripraviť pred telefonátom veterinárovi?", "Čo možno krátko sledovať doma?"],
        homeSteps: ["Sleduj dýchanie, vedomie, príjem vody a rýchlosť zhoršovania.", "Zapíš čas vzniku príznakov a urob fotografiu alebo krátke video.", "Priprav hmotnosť psa, lieky a informácie o poslednom jedle a stolici."],
        warningSigns: ["sťažené dýchanie, kolaps alebo opakované kŕče", "nafúknuté tvrdé brucho a neúspešné pokusy zvracať", "silné krvácanie, úraz alebo podozrenie na otravu"],
        expertAdvice: "Pri rýchlom zhoršovaní, bolesti alebo neistote zavolaj veterinárovi. Ľudské lieky psovi nepodávaj bez jeho pokynu.",
        serviceLinks: [{ label: "Nájsť veterinára", href: "/adresar/veterinari" }, { label: "Psia fyzioterapia", href: "/adresar/fyzioterapia" }],
        featuredArticleSlugs: ["kedy-ist-so-psom-k-veterinarovi", "horuce-dni-so-psom-bezpecne"],
      },
      {
        slug: "vyziva", label: "Výživa", icon: "🥣", description: "Krmivá, dávky, kondícia a rozhodovanie bez marketingových mýtov.",
        intro: "Vyberaj krmivo podľa potrieb konkrétneho psa, jeho kondície a tolerancie — nie iba podľa reklamy na obale.",
        popularTopics: ["Výber granúl", "Denná dávka", "Zmena krmiva", "Zdravá kondícia"],
        commonQuestions: ["Ako spoznám kompletné krmivo?", "Koľko má pes denne zjesť?", "Ako bezpečne prejsť na nové krmivo?"],
        homeSteps: ["Sleduj hmotnosť, rebrá, pás, stolicu, kožu a srsť.", "Nové krmivo zavádzaj postupne počas niekoľkých dní.", "Maškrty započítaj do celkového denného príjmu."],
        warningSigns: ["opakované vracanie alebo dlhotrvajúca hnačka", "chudnutie, odmietanie potravy alebo výrazná apatia", "opuch, dýchacie ťažkosti alebo podozrenie na alergickú reakciu"],
        expertAdvice: "Pri dlhodobých ťažkostiach, ochorení alebo eliminačnej diéte nastav stravu s veterinárom alebo veterinárnym nutričným odborníkom.",
        serviceLinks: [{ label: "Nájsť veterinára", href: "/adresar/veterinari" }, { label: "Výživové poradenstvo", href: "/adresar/dalsie-sluzby" }],
        featuredArticleSlugs: ["ako-vybrat-granule-bez-marketingovych-mytov"],
      },
      {
        slug: "vycvik", label: "Každodenná výchova", icon: "🦮", description: "Praktické návyky postavené na dôvere a zrozumiteľných pravidlách.",
        intro: "Krátke, zrozumiteľné tréningy pomáhajú psovi uspieť doma, na vodítku aj v bežnom ruchu.",
        popularTopics: ["Chôdza na vodítku", "Privolanie", "Pokoj doma", "Základné návyky"],
        commonQuestions: ["Ako začať bez zbytočného tlaku?", "Prečo pes poslúcha doma, ale nie vonku?", "Ako často a ako dlho trénovať?"],
        homeSteps: ["Začni v pokojnom prostredí a odmeň správne správanie.", "Zvyšuj vždy iba jednu náročnosť: čas, vzdialenosť alebo rušenie.", "Konči krátky tréning skôr, než pes stratí sústredenie."],
        warningSigns: ["tréning vyvoláva strach, zamŕzanie alebo únik", "pes presmeruje frustráciu na človeka alebo iného psa", "správanie sa náhle zmenilo bez zjavnej príčiny"],
        expertAdvice: "Ak sa problém zhoršuje alebo je spojený so strachom či agresiou, vyhľadaj trénera pracujúceho bez nátlaku a podľa potreby veterinára.",
        serviceLinks: [{ label: "Psí tréneri a školy", href: "/adresar/treneri" }, { label: "Kynologické kluby", href: "/adresar/kynologicke-kluby" }],
        featuredArticleSlugs: ["chodza-pri-nohe-bez-tahania"],
      },
      {
        slug: "spravanie", label: "Správanie", icon: "🐕", description: "Strach, samota, štekanie, reaktivita a emócie psa.",
        intro: "Správanie je informácia. Hľadaj jeho príčinu, spúšťače a bezpečný postup namiesto trestu za samotný prejav.",
        popularTopics: ["Samota", "Strach", "Štekanie", "Reaktivita"],
        commonQuestions: ["Čo správanie spúšťa?", "Ako znížiť stres bez trestania?", "Kedy už potrebujem odbornú pomoc?"],
        homeSteps: ["Zapíš miesto, čas, spúšťač a intenzitu správania.", "Zväčši vzdialenosť od spúšťača a predchádzaj opakovaniu konfliktu.", "Odmeň pokojné alternatívne správanie v zvládnuteľnej situácii."],
        warningSigns: ["pes ohrozuje seba, človeka alebo iné zviera", "panika pri samote alebo sebapoškodzovanie", "náhla výrazná zmena správania, ktorá môže súvisieť s bolesťou"],
        expertAdvice: "Pri agresii, panike alebo náhlej zmene najprv vylúč zdravotný problém a potom pracuj s kvalifikovaným odborníkom na správanie.",
        serviceLinks: [{ label: "Psí tréneri a školy", href: "/adresar/treneri" }, { label: "Nájsť veterinára", href: "/adresar/veterinari" }],
      },
      {
        slug: "srst-a-hygiena", label: "Srsť a hygiena", icon: "🧼", description: "Česanie, kúpanie, pazúry, zuby a uši.",
        intro: "Pravidelná krátka starostlivosť udrží psa v pohodlí a pomôže zachytiť zmeny na koži, ušiach, zuboch či pazúroch včas.",
        popularTopics: ["Česanie a kúpanie", "Zuby", "Uši", "Pazúry"],
        commonQuestions: ["Ako často psa kúpať?", "Ako ho naučiť pokojnej manipulácii?", "Kedy už zmena kože patrí veterinárovi?"],
        homeSteps: ["Kontroluj kožu, labky, uši, oči a chrup pri pokojnej manipulácii.", "Používaj pomôcky určené pre psa a postupuj po krátkych krokoch.", "Srsť upravuj podľa jej typu, nie podľa univerzálneho kalendára."],
        warningSigns: ["bolesť, krvácanie, hnis alebo silný zápach", "intenzívne svrbenie, lysiny alebo mokvajúca koža", "opuch oka, náhle privieranie oka alebo cudzí predmet"],
        expertAdvice: "Bolestivé, zapálené alebo rýchlo sa meniace nálezy nerieš iba kozmetikou. Najprv ich ukáž veterinárovi.",
        serviceLinks: [{ label: "Psie salóny", href: "/adresar/salony-a-sluzby" }, { label: "Nájsť veterinára", href: "/adresar/veterinari" }],
      },
      {
        slug: "senior", label: "Psí senior", icon: "🤍", description: "Pohyb, pohodlie, výživa a zmeny v staršom veku.",
        intro: "Starnutie nemusí znamenať pasivitu. Primeraný pohyb, pohodlie a včas zachytené zmeny pomáhajú udržať kvalitu života.",
        popularTopics: ["Pohyb a kĺby", "Zmeny správania", "Výživa seniora", "Pohodlie doma"],
        commonQuestions: ["Ktoré zmeny patria k veku a ktoré k bolesti?", "Ako upraviť pohyb seniora?", "Ako často absolvovať preventívnu prehliadku?"],
        homeSteps: ["Sleduj vstávanie, schody, spánok, chuť do jedla a orientáciu.", "Uprav povrch, pelech a prístup k vode tak, aby sa pes nešmýkal.", "Zachovaj pravidelný, mierny pohyb podľa aktuálnej kondície."],
        warningSigns: ["náhly kolaps, slabosť alebo problémy s dýchaním", "výrazná bolesť, nemožnosť postaviť sa alebo náhle ochrnutie", "rýchle chudnutie, odmietanie potravy alebo zmätenosť"],
        expertAdvice: "Nové zmeny nepripisuj automaticky veku. Bolesť, ochorenie aj kognitívne zmeny sa často dajú zmierniť po vyšetrení.",
        serviceLinks: [{ label: "Nájsť veterinára", href: "/adresar/veterinari" }, { label: "Psia fyzioterapia", href: "/adresar/fyzioterapia" }],
      },
    ],
  },
  {
    slug: "aktivity",
    label: "Výcvik a aktivity",
    icon: "🥾",
    accent: "gold",
    eyebrow: "Pohyb, spolupráca a zážitky",
    description: "Psie športy, výlety, tréning aj cestovanie vybrané podľa potrieb konkrétneho psa.",
    intro: "Nájdi aktivitu podľa veku, zdravia, kondície a motivácie psa. Začni bezpečne, zvyšuj náročnosť postupne a užite si spoločný čas bez zbytočného tlaku na výkon.",
    articleEnabled: true,
    subpages: [
      {
        slug: "psie-sporty", label: "Psie športy", icon: "🏅", description: "Canicross, bikejoring, nosework, agility, obedience, aporty a ďalšie disciplíny.",
        intro: "Vyber šport podľa stavby tela, zdravia a toho, čo psa prirodzene baví. Základy techniky a pokojná spolupráca patria pred rýchlosť aj výsledky.",
        popularTopics: ["Canicross", "Bikejoring", "Nosework", "Aportovanie"],
        commonQuestions: ["Ktorý šport sa hodí pre môjho psa?", "Kedy môže mladý pes začať s väčšou záťažou?", "Akú výbavu potrebujeme na prvý tréning?"],
        homeSteps: ["Najprv nauč základné povely a prácu v pokojnom prostredí.", "Začni krátkymi ľahkými tréningmi a sleduj regeneráciu psa.", "Techniku a výbavu si pri náročnej disciplíne nechaj skontrolovať skúseným trénerom."],
        warningSigns: ["neochota pokračovať, krívanie alebo zmena pohybu", "prehriatie, neprimerané zadýchanie alebo pomalé zotavenie", "strach, frustrácia alebo strata radosti z aktivity"],
        expertAdvice: "Pri šteniatku, seniorovi, psovi s nadváhou alebo zdravotným obmedzením konzultuj typ a intenzitu záťaže s veterinárom alebo fyzioterapeutom.",
        serviceLinks: [{ label: "Tréneri a psie školy", href: "/adresar/treneri" }, { label: "Kynologické kluby", href: "/adresar/kynologicke-kluby" }],
        featuredArticleSlugs: ["canicross-so-psom-ako-zacat-aku-vybavu-potrebujete-a-ako-trenovat-bezpecne", "bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku", "aport-od-hry-k-spolahlivemu-odovzdaniu"],
        seoTitle: "Psie športy – výber, tréning a bezpečný začiatok",
        metaDescription: "Vyberte psí šport podľa kondície a povahy psa. Praktické návody pre canicross, bikejoring, nosework, aportovanie a ďalšie disciplíny.",
      },
      {
        slug: "vylety-so-psom", label: "Výlety so psom", icon: "🥾", description: "Trasy, náročnosť, pravidlá, počasie a praktická výbava na cestu.",
        intro: "Dobrý výlet zodpovedá kondícii psa, počasiu aj povrchu trasy. Naplánuj vodu, prestávky a bezpečný návrat skôr, než vyrazíte.",
        popularTopics: ["Turistika so psom", "Výbava na výlet", "Pohyb v horúčave", "Pravidlá v prírode"],
        commonQuestions: ["Akú dlhú trasu pes zvládne?", "Čo zbaliť psovi na túru?", "Kde musí byť pes na vôdzke?"],
        homeSteps: ["Zvoľ trasu kratšiu než bežný limit psa a over prevýšenie aj povrch.", "Zbaľ vodu, misku, vôdzku, lekárničku, sáčky a identifikačné údaje.", "Naplánuj prestávky a možnosť trasu skrátiť pri zmene počasia alebo kondície."],
        warningSigns: ["horúci povrch, dusno alebo nedostatok tieňa a vody", "odreté labky, krívanie alebo výrazné spomalenie", "nezvládnuteľný terén, voľne žijúce zvieratá alebo zákaz vstupu so psom"],
        expertAdvice: "Dĺžku výletu neurčuje iba veľkosť psa. Rozhoduje vek, kondícia, zdravotný stav, teplota, povrch aj skúsenosť s podobnou záťažou.",
        serviceLinks: [{ label: "Najbližšie podujatia", href: "/podujatia" }, { label: "Veterinári podľa lokality", href: "/adresar/veterinari" }],
      },
      {
        slug: "dog-friendly-miesta", label: "Dog-friendly miesta", icon: "📍", description: "Miesta, kde sú psy vítané a podmienky návštevy sú jasné vopred.",
        intro: "Over si pravidlá ešte pred návštevou. Označenie dog-friendly môže znamenať povolený vstup, nie automaticky priestor vhodný pre každého psa.",
        popularTopics: ["Pravidlá vstupu", "Správanie na mieste", "Bezpečný pohyb", "Cestovanie po Slovensku"],
        commonQuestions: ["Ako overím, či je pes naozaj vítaný?", "Čo robiť v preplnenom priestore?", "Kedy je lepšie psa nechať doma?"],
        homeSteps: ["Over aktuálne pravidlá, vôdzku, náhubok, poplatky a dostupnosť vody.", "Zvoľ pokojnejší čas a rešpektuj osobný priestor ostatných ľudí aj psov.", "Maj pripravený plán odchodu, ak je pes unavený, preťažený alebo v strese."],
        warningSigns: ["preplnený priestor bez možnosti odstupu", "horúčava, klzký povrch alebo chýbajúce miesto na oddych", "opakované stresové signály, reaktivita alebo strach psa"],
        expertAdvice: "Dog-friendly neznamená vhodné pre každého psa. Pohoda a bezpečnosť psa majú prednosť pred tým, aby absolvoval každú spoločnú zastávku.",
        serviceLinks: [{ label: "Služby pre psov", href: "/adresar" }, { label: "Hotely a opatrovanie", href: "/adresar/hotely-a-opatrovanie" }],
      },
      {
        slug: "dovolenka-so-psom", label: "Dovolenka so psom", icon: "🧳", description: "Ubytovanie, doprava, doklady, režim a bezpečnosť mimo domova.",
        intro: "Cestu plánuj od potrieb psa: spôsob dopravy, prestávky, doklady, miestne pravidlá aj miesto, kde si bezpečne oddýchne.",
        popularTopics: ["Cesta autom", "Doklady a hranice", "Ubytovanie so psom", "Lekárnička na cestu"],
        commonQuestions: ["Aké doklady pes potrebuje?", "Ako často robiť prestávky počas cesty?", "Čo overiť v ubytovaní pred rezerváciou?"],
        homeSteps: ["Over čip, registráciu, očkovania a podmienky cieľovej aj tranzitnej krajiny.", "Priprav známu deku, krmivo, lieky, vodu a bezpečné pripútanie v aute.", "Vopred nájdi veterinára v cieli a ulož si dôležité kontakty."],
        warningSigns: ["neaktuálne doklady alebo nejasné vstupné podmienky", "dlhá cesta bez prestávok, vody a teplotného komfortu", "ubytovanie bez bezpečného priestoru alebo s neoverenými obmedzeniami"],
        expertAdvice: "Pravidlá cestovania sa líšia podľa krajiny a môžu sa meniť. Pred odchodom ich over v oficiálnych zdrojoch a pri zdravotných otázkach u veterinára.",
        serviceLinks: [{ label: "Hotely a opatrovanie", href: "/adresar/hotely-a-opatrovanie" }, { label: "Veterinári", href: "/adresar/veterinari" }],
      },
    ],
  },
  {
    slug: "podujatia",
    label: "Podujatia",
    icon: "📅",
    accent: "coral",
    eyebrow: "Čo sa deje",
    description: "Kalendár výstav, pretekov, seminárov, tréningov a stretnutí.",
    intro: "Podujatia budú zoradené podľa dátumu, kraja a typu, aby si rýchlo našiel program vo svojom okolí.",
    articleEnabled: true,
    subpages: [
      { slug: "kalendar", label: "Kalendár podujatí", description: "Všetky termíny na jednom mieste s praktickými filtrami." },
      { slug: "vystavy", label: "Výstavy", description: "Národné, medzinárodné a klubové výstavy psov." },
      { slug: "preteky", label: "Preteky", description: "Športové súťaže a skúšky podľa disciplíny." },
      { slug: "seminare", label: "Semináre a tréningy", description: "Vzdelávanie, workshopy a otvorené skupinové tréningy." },
      { slug: "pridat-podujatie", label: "Pridať podujatie", description: "Priestor pre organizátorov po redakčnom overení." },
    ],
  },
  {
    slug: "adresar",
    label: "Služby pre psov",
    icon: "📍",
    accent: "forest",
    eyebrow: "Nájdi pomoc nablízku",
    description: "Veterinári, tréneri, školy, kluby a praktické služby na jednom mieste.",
    intro: "Profily môžeš filtrovať podľa kraja, okresu, mesta, zamerania a typu služby.",
    articleEnabled: true,
    subpages: [
      { slug: "veterinari", label: "Veterinári", description: "Ambulancie, kliniky, pohotovosti a ich zameranie." },
      { slug: "treneri", label: "Psí tréneri a psie školy", description: "Individuálny aj skupinový výcvik, správanie, šteniatka a špecializované tréningy." },
      { slug: "kynologicke-kluby", label: "Kynologické kluby", description: "Cvičiská, športové kluby a miestne kynologické organizácie." },
      { slug: "chovatelske-kluby", label: "Chovateľské kluby", description: "Oficiálne kluby zastrešujúce jednotlivé plemená." },
      { slug: "chovatelske-stanice", label: "Chovateľské stanice", description: "Profily chovateľských staníc podľa plemena a kraja." },
      { slug: "salony-a-sluzby", label: "Salóny", description: "Úprava srsti a pravidelná starostlivosť." },
      { slug: "hotely-a-opatrovanie", label: "Hotely a opatrovanie", description: "Ubytovanie a opatrovanie počas neprítomnosti." },
      { slug: "vencenie", label: "Venčenie", description: "Pravidelné aj jednorazové venčenie psov." },
      { slug: "fyzioterapia", label: "Fyzioterapia", description: "Rehabilitácia, regenerácia a podpora pohybu." },
      { slug: "dalsie-sluzby", label: "Ďalšie služby", description: "Ďalšie praktické služby pre psov a ich ľudí." },
    ],
  },
  {
    slug: "pomoc-psom",
    label: "Pomoc psom",
    icon: "❤️",
    accent: "coral",
    eyebrow: "Pomoc, ktorá má cieľ",
    description: "Adopcia, útulky, záchrana, dočasná opatera a overené možnosti pomoci.",
    intro: "Na jednom mieste spojíme ľudí, ktorí chcú pomôcť, s overenými útulkami, organizáciami a konkrétnymi prípadmi.",
    articleEnabled: true,
    subpages: [
      { slug: "adopcia", label: "Psy na adopciu", description: "Psy hľadajúce bezpečný a zodpovedný domov." },
      { slug: "utulky", label: "Útulky a organizácie", description: "Overené zariadenia a záchranné občianske združenia." },
      { slug: "docasna-opatera", label: "Dočasná opatera", description: "Pomoc psovi na čas, kým nájde trvalý domov." },
      { slug: "zbierky", label: "Zbierky a výzvy", description: "Transparentné výzvy overené pred zverejnením." },
      { slug: "stratene-a-najdene", label: "Stratené a nájdené psy", description: "Rýchle zdieľanie dôležitých informácií a uzatvorenie prípadu." },
      { slug: "dobrovolnictvo", label: "Ako pomôcť", description: "Venčenie, prevoz, fotografovanie aj materiálna pomoc." },
    ],
  },
  {
    slug: "recenzie",
    label: "Recenzie a testy",
    icon: "⭐",
    accent: "gold",
    eyebrow: "Testy bez marketingovej hmly",
    description: "Praktické skúsenosti s krmivami, výbavou, hračkami a cestovateľskými produktmi.",
    intro: "Pri každej recenzii bude jasné, čo sme hodnotili, pre akého psa je produkt určený a či bol obsah podporený partnerom.",
    articleEnabled: true,
    subpages: [
      { slug: "krmiva", label: "Krmivá", description: "Zloženie, použitie, energia a praktické hodnotenie." },
      { slug: "maskrty", label: "Maškrty", description: "Tréningové odmeny, žuvanie a každodenné používanie." },
      { slug: "hracky", label: "Hračky", description: "Odolnosť, bezpečnosť a vhodnosť podľa typu hry." },
      { slug: "postroje-a-vodidla", label: "Postroje a vodidlá", description: "Pohodlie, ovládanie a bezpečnosť pri pohybe." },
      { slug: "gps-lokatory", label: "GPS lokátory", description: "Dosah, výdrž, presnosť a praktické používanie." },
      { slug: "peleche", label: "Pelechy", description: "Pohodlie, údržba a vhodnosť podľa veľkosti psa." },
      { slug: "cestovanie", label: "Cestovanie", description: "Autovýbava, nosiče, fľaše a veci na výlet." },
      { slug: "vycvikova-vybava", label: "Výcviková výbava", description: "Pomôcky pre bezpečný a zrozumiteľný tréning." },
    ],
  },
];

export const articlePortalSectionOptions = [
  { slug: "clanky", label: "Všeobecné články" },
  ...portalSections
    .filter((section) => section.articleEnabled)
    .map((section) => ({ slug: section.slug as ArticlePortalSection, label: section.label })),
];

export function getPortalSection(slug: string) {
  return portalSections.find((section) => section.slug === slug) ?? null;
}

export function getPortalSubpage(sectionSlug: string, subpageSlug: string) {
  const section = getPortalSection(sectionSlug);
  const subpage = section?.subpages.find((item) => item.slug === subpageSlug) ?? null;
  return section && subpage ? { section, subpage } : null;
}

export function portalSubpageHref(section: Pick<PortalSection, "slug">, subpage: PortalSubpage) {
  return subpage.href ?? `/${section.slug}/${subpage.slug}`;
}

export function isArticlePortalSection(value: string): value is ArticlePortalSection {
  return (articlePortalSectionSlugs as readonly string[]).includes(value);
}

export function articlePortalSection(article: Pick<Article, "portalSection">): ArticlePortalSection {
  return article.portalSection && isArticlePortalSection(article.portalSection) ? article.portalSection : "clanky";
}

export function articleHref(article: Pick<Article, "slug" | "portalSection">) {
  const section = articlePortalSection(article);
  return section === "clanky" ? `/clanky/${article.slug}` : `/${section}/${article.slug}`;
}

export function portalSectionLabel(slug: string) {
  if (slug === "clanky") return "Všeobecné články";
  return getPortalSection(slug)?.label ?? "Články";
}
