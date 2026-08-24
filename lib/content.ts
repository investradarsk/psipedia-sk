export type ArticleSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  tip?: string;
};

export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  category: "Výcvik" | "Zdravie" | "Výživa" | "Život so psom";
  date: string;
  dateIso: string;
  updatedDate: string;
  updatedDateIso: string;
  readTime: string;
  image?: string;
  accent: "forest" | "coral" | "gold" | "blue";
  author: string;
  intro: string;
  takeaway: string;
  sources: { label: string; url: string }[];
  sections: ArticleSection[];
  blocks?: import("@/lib/article-blocks").ArticleBlock[];
  portalSection?: import("@/lib/portal").ArticlePortalSection;
  portalSubpage?: string;
  newsCategory?: import("@/lib/news").NewsCategorySlug;
};

export const articles: Article[] = [
  {
    slug: "prvy-rok-labradora-mesiac-po-mesiaci",
    portalSection: "steniatka",
    portalSubpage: "rast-a-vyvoj",
    title: "Prvý rok labradora: čo vás čaká mesiac po mesiaci",
    excerpt:
      "Rast, výmena zubov, puberta aj prvé seriózne tréningy. Praktická mapa prvého roka bez zbytočného stresu.",
    category: "Život so psom",
    date: "16. augusta 2026",
    dateIso: "2026-08-16",
    updatedDate: "16. augusta 2026",
    updatedDateIso: "2026-08-16",
    readTime: "8 min",
    image: "/images/hero-labrador.webp",
    accent: "forest",
    author: "Redakcia Psipedia",
    intro:
      "Labrador dospieva rýchlo telom, no oveľa pomalšie hlavou. V prvom roku sa preto striedajú obdobia veľkých pokrokov s dňami, keď šteňa akoby zabudlo všetko, čo vedelo. Je to normálne – a dá sa na to dobre pripraviť.",
    takeaway:
      "Najdôležitejší cieľ prvého roka nie je dokonale poslušný pes. Je ním zdravý, sebavedomý parťák, ktorý vám dôveruje a rozumie základným pravidlám.",
    sources: [
      { label: "AAHA: Canine Life Stage Guidelines", url: "https://www.aaha.org/resources/life-stage-canine-2019/" },
      { label: "AVSAB: Puppy Socialization Position Statement", url: "https://avsab.org/resources/position-statements/" },
    ],
    sections: [
      {
        heading: "2–4 mesiace: bezpečie, vzťah a krátke učenie",
        paragraphs: [
          "Po príchode domov potrebuje šteňa predvídateľný režim, veľa spánku a bezpečné objavovanie sveta. Tréning počítajte na desiatky sekúnd, nie na dlhé bloky.",
          "Meno, privolanie, pokojné nasadenie obojka a manipulácia s labkami či ušami majú väčšiu hodnotu než efektné triky. Socializácia znamená pokojné dobré skúsenosti, nie stretnutie s každým psom na ulici.",
        ],
        bullets: [
          "18 až 20 hodín odpočinku denne",
          "3 až 5 mikrolekcií po jednej minúte",
          "mäkký povrch a žiadne nútené dlhé behanie",
        ],
        tip: "Odmeňte šteňa aj za to, že si samo ľahne a oddychuje. Pokoj je správanie, ktoré sa dá naučiť.",
      },
      {
        heading: "4–6 mesiacov: zuby, energia a jasné hranice",
        paragraphs: [
          "Pri výmene zubov rastie potreba hrýzť a môže dočasne klesnúť chuť nosiť tvrdšie aporty. Ponúknite bezpečné žuvacie alternatívy a pri hre netlačte na výkon.",
          "Toto je dobrý čas upevniť privolanie, chôdzu na voľnom vodítku, krátke zotrvanie a odovzdanie predmetu do ruky. Stále trénujte hravo a končite, kým má pes chuť pokračovať.",
        ],
      },
      {
        heading: "6–9 mesiacov: puberta nie je neposlušnosť",
        paragraphs: [
          "Hormóny, nové pachy a väčšia samostatnosť znižujú schopnosť sústrediť sa. Zdanlivý regres neznamená, že tréning zlyhal. Dočasne zjednodušte prostredie a vráťte sa k vyššej frekvencii odmien.",
          "Dlhé vodidlo umožní bezpečne precvičovať privolanie. Náročnosť zvyšujte vždy iba v jednej veci: vzdialenosť, čas alebo rušivé podnety.",
        ],
        bullets: [
          "neopakujte povel päťkrát",
          "zabráňte nacvičovaniu útekov",
          "odmeňujte dobrovoľný kontakt s vami",
        ],
      },
      {
        heading: "9–12 mesiacov: sila rastie, kostra ešte dozrieva",
        paragraphs: [
          "Mladý labrador už vyzerá dospelo, ale jeho pohybový aparát stále dozrieva. Kondíciu budujte plynulo chôdzou, plávaním a kontrolovaným pohybom v teréne.",
          "Tréning môže byť systematickejší: práca pri nohe, stop whistle, smerové vysielanie či pokoj na stanovišti. Kvalita niekoľkých opakovaní je stále dôležitejšia než ich počet.",
        ],
        tip: "Hmotnosť sledujte podľa kondície tela, nie iba podľa tabuľky. Rebrá majú byť ľahko hmatateľné a pás viditeľný zhora.",
      },
    ],
  },
  {
    slug: "chodza-pri-nohe-bez-tahania",
    portalSection: "starostlivost",
    title: "Chôdza pri nohe bez ťahania: plán na 14 dní",
    excerpt:
      "Jednoduchý tréningový postup od prvého kroku až po pokojné prechádzky medzi ľuďmi a psami.",
    category: "Výcvik",
    date: "14. augusta 2026",
    dateIso: "2026-08-14",
    updatedDate: "16. augusta 2026",
    updatedDateIso: "2026-08-16",
    readTime: "7 min",
    image: "/images/trening-pri-nohe.webp",
    accent: "coral",
    author: "Redakcia Psipedia",
    intro:
      "Ťahanie na vodítku sa najčastejšie neupraví silou, ale jasným systémom. Pes potrebuje pochopiť, ktorá pozícia mu otvára cestu vpred a kde sa mu oplatí venovať vám pozornosť.",
    takeaway:
      "Najskôr učte pozíciu bez chôdze, potom pridávajte kroky a až nakoniec rušivé prostredie. Ak pes zlyháva, úloha je príliš ťažká – nie pes tvrdohlavý.",
    sources: [
      { label: "AVSAB: Humane Dog Training Position Statement", url: "https://avsab.org/resources/position-statements/" },
    ],
    sections: [
      {
        heading: "Dni 1–3: odmeňovacia zóna",
        paragraphs: [
          "V tichej izbe si vyberte stranu a odmeňujte psa tesne pri šve nohavíc. Najprv stačí, keď si k vám dobrovoľne príde. Povel pridajte až vtedy, keď pozíciu ponúka spoľahlivo.",
        ],
        bullets: ["5 odmien pri nohe", "krátka pauza", "najviac 3 série"],
      },
      {
        heading: "Dni 4–7: prvých päť krokov",
        paragraphs: [
          "Urobte jeden krok, označte správnu pozíciu slovom alebo klikrom a odmeňte. Postupne striedajte jeden, tri a päť krokov, aby pes nepredbiehal v očakávaní stále rovnakej vzdialenosti.",
        ],
        tip: "Odmenu podávajte pri nohe, nie pred sebou. Miesto odmeny formuje miesto, kde bude pes chcieť kráčať.",
      },
      {
        heading: "Dni 8–11: záhrada a pokojná ulica",
        paragraphs: [
          "Preneste cvičenie von, ale znížte kritériá. Odmeňujte častejšie a povoľte psovi prestávky na čuchanie ako prirodzenú odmenu za niekoľko pekných krokov.",
        ],
      },
      {
        heading: "Dni 12–14: rušivé podnety s odstupom",
        paragraphs: [
          "Ľudí a psov sledujte z takej vzdialenosti, v ktorej váš pes ešte dokáže jesť a reagovať. Pár dobrých krokov je úspech. Vzdialenosť skracujte po malých častiach v ďalších tréningoch.",
        ],
        bullets: ["voľné vodítko", "dobrovoľný očný kontakt", "otočka skôr, než pes vyštartuje"],
      },
    ],
  },
  {
    slug: "kedy-ist-so-psom-k-veterinarovi",
    portalSection: "starostlivost",
    title: "Kedy ísť so psom k veterinárovi hneď a kedy počkať",
    excerpt:
      "Prehľad varovných príznakov, pri ktorých nečakať do rána, a situácií vhodných na pokojné sledovanie.",
    category: "Zdravie",
    date: "12. augusta 2026",
    dateIso: "2026-08-12",
    updatedDate: "16. augusta 2026",
    updatedDateIso: "2026-08-16",
    readTime: "6 min",
    image: "/images/zdravie-veterinar.webp",
    accent: "blue",
    author: "Redakcia Psipedia",
    intro:
      "Majiteľ psa často rieši rovnakú dilemu: je to drobnosť, ktorú môžem sledovať, alebo stav vyžadujúci urgentnú pomoc? Rozhoduje celkový stav psa, rýchlosť zhoršovania a kombinácia príznakov.",
    takeaway:
      "Ak má pes problém s dýchaním, kolabuje, opakovane sa napína bez zvracania alebo požil toxickú látku, kontaktujte veterinárnu pohotovosť okamžite.",
    sources: [
      { label: "AVMA: First aid tips for pet owners", url: "https://www.avma.org/resources-tools/pet-owners/emergencycare/first-aid-tips-pet-owners" },
    ],
    sections: [
      {
        heading: "Volajte veterinára okamžite",
        paragraphs: [
          "Akútny stav sa môže zhoršiť v minútach. Počas telefonátu povedzte vek a hmotnosť psa, príznaky, čas ich vzniku a všetko, čo mohol zjesť alebo čo sa mu mohlo stať.",
        ],
        bullets: [
          "sťažené dýchanie, modré alebo veľmi bledé sliznice",
          "kolaps, bezvedomie alebo opakované kŕče",
          "nafúknuté tvrdé brucho a neúspešné pokusy zvracať",
          "silné krvácanie, úraz autom alebo pád z výšky",
          "podozrenie na jed, lieky, čokoládu či xylitol",
        ],
      },
      {
        heading: "Vyšetrenie ešte v ten deň",
        paragraphs: [
          "Opakované vracanie, krv v stolici, výrazná bolesť, náhle krívanie bez došľapu či apatia u šteňaťa si zaslúžia vyšetrenie v ten istý deň. Malé psy a šteňatá sa dehydratujú rýchlejšie.",
        ],
      },
      {
        heading: "Čo možno krátko sledovať doma",
        paragraphs: [
          "Jednorazová mäkšia stolica alebo jednorazové zvracanie u inak veselého dospelého psa sa dá krátko sledovať. Pes musí piť, normálne dýchať a stav sa nesmie zhoršovať.",
        ],
        tip: "Urobte fotografiu alebo krátke video príznaku. Veterinárovi môže pomôcť, ak sa správanie v ambulancii už neprejaví.",
      },
      {
        heading: "Čo si pripraviť na telefonát",
        paragraphs: [
          "Majte poruke zoznam liekov, očkovací preukaz, približnú hmotnosť a informáciu o poslednom jedle, močení a stolici. Nikdy nepodávajte ľudské lieky bez pokynu veterinára.",
        ],
      },
    ],
  },
  {
    slug: "ako-vybrat-granule-bez-marketingovych-mytov",
    portalSection: "starostlivost",
    title: "Ako vybrať granule bez marketingových mýtov",
    excerpt:
      "Zloženie, energia, tolerancia a kondícia psa: štyri veci, ktoré majú väčšiu váhu než predná strana obalu.",
    category: "Výživa",
    date: "9. augusta 2026",
    dateIso: "2026-08-09",
    updatedDate: "16. augusta 2026",
    updatedDateIso: "2026-08-16",
    readTime: "9 min",
    accent: "gold",
    author: "Redakcia Psipedia",
    intro:
      "Dobré krmivo nie je to s najdlhším zoznamom módnych surovín. Je to kompletná strava, ktorú konkrétny pes dobre trávi, prospieva na nej a zodpovedá jeho veku, aktivite aj zdravotnému stavu.",
    takeaway:
      "Obal je začiatok, nie verdikt. Sledujte kondíciu, stolicu, kožu, srsť a energiu psa počas niekoľkých týždňov.",
    sources: [
      { label: "WSAVA: Global Nutrition Guidelines", url: "https://wsava.org/global-guidelines/global-nutrition-guidelines/" },
      { label: "WSAVA: Global Nutrition Toolkit", url: "https://wsava.org/wp-content/uploads/2022/11/WSAVA-Global-Nutrition-Toolkit-English.pdf" },
    ],
    sections: [
      {
        heading: "Začnite označením kompletného krmiva",
        paragraphs: [
          "Na každodenné kŕmenie hľadajte kompletné krmivo pre príslušnú vekovú kategóriu. Doplnkové krmivo samo osebe nemusí pokryť všetky živiny.",
        ],
      },
      {
        heading: "Kalórie rozhodujú o dávke",
        paragraphs: [
          "Rovnakých 300 gramov dvoch granúl môže mať odlišnú energetickú hodnotu. Tabuľka na obale je iba štartovací bod; dávku dolaďujte podľa reálnej kondície.",
        ],
        bullets: ["ľahko hmatateľné rebrá", "viditeľný pás zhora", "brucho mierne vtiahnuté zboku"],
      },
      {
        heading: "Zmena patrí do viacerých dní",
        paragraphs: [
          "Nové a pôvodné krmivo miešajte postupne približne päť až sedem dní. Pri citlivom trávení pokojne dlhšie. Náhla zmena často spôsobí problém, ktorý nesúvisí s kvalitou receptúry.",
        ],
      },
      {
        heading: "Kedy riešiť veterinára",
        paragraphs: [
          "Dlhodobá hnačka, vracanie, chudnutie, výrazné svrbenie alebo opakované zápaly uší si zaslúžia vyšetrenie. Eliminačná diéta má zmysel iba v presne vedenom režime.",
        ],
      },
    ],
  },
  {
    slug: "aport-od-hry-k-spolahlivemu-odovzdaniu",
    portalSection: "aktivity",
    title: "Aport: od naháňačky k spoľahlivému odovzdaniu do ruky",
    excerpt:
      "Ako zachovať chuť prinášať a pritom psa naučiť pokojne držať, prísť a odovzdať predmet.",
    category: "Výcvik",
    date: "6. augusta 2026",
    dateIso: "2026-08-06",
    updatedDate: "16. augusta 2026",
    updatedDateIso: "2026-08-16",
    readTime: "7 min",
    accent: "forest",
    author: "Redakcia Psipedia",
    intro:
      "Prirodzená chuť naháňať predmet ešte nie je hotový aport. Celé správanie sa skladá z vybehnutia, uchopenia, návratu, držania a odovzdania. Každú časť možno zlepšiť samostatne.",
    takeaway:
      "Nikdy psa s aportom nenaháňajte. Urobte návrat k vám hodnotnejší než samostatná hra s predmetom.",
    sources: [
      { label: "AVSAB: Humane Dog Training Position Statement", url: "https://avsab.org/resources/position-statements/" },
    ],
    sections: [
      {
        heading: "Začnite v úzkom priestore",
        paragraphs: [
          "Chodba alebo priestor medzi plotom znižujú možnosť odbiehať do strán. Hoďte mäkký dummy iba pár metrov a cúvaním psa pozvite k sebe.",
        ],
      },
      {
        heading: "Výmena, nie odobratie",
        paragraphs: [
          "Predmet nevytrhávajte. Jednou rukou pokojne podoprite dummy a druhou podajte odmenu. Po signále na pustenie môže niekedy hra okamžite pokračovať.",
        ],
        tip: "Dve až štyri kvalitné opakovania úplne stačia. Skončite v momente, keď pes ešte chce ďalšie.",
      },
      {
        heading: "Pokojné držanie učte odzadu",
        paragraphs: [
          "Samostatne odmeňujte krátke pokojné držanie predmetu bez prežúvania. Čas pridávajte po zlomkoch sekundy a predmet odoberte skôr, než ho pes pustí sám.",
        ],
      },
      {
        heading: "Voda a rušivé prostredie až neskôr",
        paragraphs: [
          "Nové miesto, dlhšia vzdialenosť a voda sú tri rôzne zvýšenia náročnosti. Pridávajte vždy iba jedno a úspech upevnite na viacerých tréningoch.",
        ],
      },
    ],
  },
  {
    slug: "horuce-dni-so-psom-bezpecne",
    portalSection: "starostlivost",
    title: "Horúce dni so psom: bezpečný režim od rána do večera",
    excerpt:
      "Kedy vyraziť, ako spoznať prehrievanie a prečo ani plávanie nie je dôvod na celodenný výkon.",
    category: "Zdravie",
    date: "2. augusta 2026",
    dateIso: "2026-08-02",
    updatedDate: "16. augusta 2026",
    updatedDateIso: "2026-08-16",
    readTime: "5 min",
    accent: "coral",
    author: "Redakcia Psipedia",
    intro:
      "Pes sa ochladzuje najmä dychčaním a horúčavu zvláda inak než človek. V lete preto meníme čas, intenzitu aj dĺžku aktivít – nie iba množstvo vody v miske.",
    takeaway:
      "Ak pes nekoordinovane kráča, výrazne sliní, vracia alebo má veľmi červené či bledé sliznice, začnite ho chladiť vlažnou vodou a ihneď kontaktujte veterinára.",
    sources: [
      { label: "AVMA: Warm weather pet safety", url: "https://www.avma.org/resources-tools/pet-owners/petcare/warm-weather-pet-safety" },
      { label: "AVMA: First aid tips for pet owners", url: "https://www.avma.org/resources-tools/pet-owners/emergencycare/first-aid-tips-pet-owners" },
    ],
    sections: [
      {
        heading: "Ráno patrí pohybu",
        paragraphs: [
          "Dlhšiu prechádzku naplánujte skoro ráno. Voľte tieň, prírodný povrch a robte prestávky. Šteňatá, seniori a psy s krátkym ňufákom potrebujú ešte konzervatívnejší režim.",
        ],
      },
      {
        heading: "Cez deň zamestnajte hlavu",
        paragraphs: [
          "Čuchacie hry, krátky tréning doma, lízacia podložka alebo hľadanie granúl unavia psa bez veľkej tepelnej záťaže.",
        ],
        bullets: ["voda stále k dispozícii", "chladná tienistá miestnosť", "žiadne čakanie v aute"],
      },
      {
        heading: "Plávanie dávkujte",
        paragraphs: [
          "Voda ochladzuje, ale intenzívne aportovanie vo vode je stále fyzický výkon. Sledujte únavu, nedovoľte psovi vypiť veľké množstvo vody a po kúpaní ho nechajte oddychovať.",
        ],
      },
      {
        heading: "Ako chladiť pri podozrení na prehriatie",
        paragraphs: [
          "Presuňte psa do tieňa, polievajte ho vlažnou – nie ľadovou – vodou a zabezpečte prúdenie vzduchu. Chladenie nesmie oddialiť cestu k veterinárovi.",
        ],
      },
    ],
  },
];

export type FciGroup = {
  number: number;
  slug: string;
  label: string;
  description: string;
};

export const fciGroups: FciGroup[] = [
  { number: 1, slug: "ovciarske-a-pastierske", label: "Ovčiarske a pastierske psy", description: "Pracovné plemená šľachtené na vedenie, stráženie a presun stád." },
  { number: 2, slug: "pince-bradace-molosy-salasnicke", label: "Pinče, bradáče, molosy a salašnícke psy", description: "Silné pracovné, strážne a salašnícke plemená rozličných veľkostí." },
  { number: 3, slug: "teriery", label: "Teriéry", description: "Odvážne, živé psy pôvodne využívané najmä na prácu pod zemou a lov škodcov." },
  { number: 4, slug: "jazveciky", label: "Jazvečíky", description: "Jedna samostatná skupina s viacerými veľkostnými a srstnými varietami." },
  { number: 5, slug: "spice-a-primitivne-typy", label: "Špice a primitívne typy", description: "Severské, ázijské a pôvodné plemená s výraznými prirodzenými vlohami." },
  { number: 6, slug: "durice-a-pribuzne", label: "Duriče, farbiare a príbuzné plemená", description: "Psy pracujúce predovšetkým nosom, často vytrvalé a hlasité pri sledovaní stopy." },
  { number: 7, slug: "stavace", label: "Stavače", description: "Poľovné psy vyhľadávajúce zver a typickým postojom označujúce jej polohu." },
  { number: 8, slug: "retrievery-sliedice-vodne", label: "Retrievery, sliediče a vodné psy", description: "Aportéri, sliediče a vodné pracovné plemená s úzkou spoluprácou s človekom." },
  { number: 9, slug: "spolocenske-a-sprievodne", label: "Spoločenské a sprievodné psy", description: "Plemená šľachtené predovšetkým pre blízke spolužitie s človekom." },
  { number: 10, slug: "chrty", label: "Chrty", description: "Rýchle, elegantné plemená orientované pri love najmä zrakom." },
];

export type Breed = {
  slug: string;
  name: string;
  image: string;
  fciGroup: number;
  fciSection: string;
  origin: string;
  group: string;
  size: string;
  weight: string;
  lifespan: string;
  coat: string;
  energy: number;
  trainability: number;
  family: number;
  intro: string;
  character: string;
  needs: string;
  goodFor: string[];
  consider: string[];
  accent: "forest" | "coral" | "gold" | "blue";
};

export const breeds: Breed[] = [
  {
    slug: "labradorsky-retriever",
    name: "Labradorský retriever",
    image: "/images/hero-labrador.webp",
    fciGroup: 8,
    fciSection: "Retrievery",
    origin: "Veľká Británia",
    group: "Retrievery",
    size: "stredne veľký až veľký",
    weight: "25–36 kg",
    lifespan: "10–13 rokov",
    coat: "krátka, hustá, s podsadou",
    energy: 5,
    trainability: 5,
    family: 5,
    intro: "Spoločenský, pracovito naladený retriever s veľkou chuťou spolupracovať, nosiť a byť súčasťou rodiny.",
    character: "Labrador býva otvorený, priateľský a silne motivovaný jedlom aj hrou. Dospieva pomalšie psychicky a v mladosti vie byť veľmi živý.",
    needs: "Potrebuje každodenný pohyb, čuchanie, tréning a kontrolovanú prácu s aportom. Dôležitá je štíhla kondícia a postupné zaťažovanie kĺbov.",
    goodFor: ["aktívne rodiny", "retrieverový výcvik", "prácu vo vode", "ľudí, ktorí radi trénujú"],
    consider: ["silné pĺznutie", "sklon k priberaniu", "búrlivá puberta", "potreba kontaktu s ľuďmi"],
    accent: "forest",
  },
  {
    slug: "zlaty-retriever",
    name: "Zlatý retriever",
    image: "/images/trening-pri-nohe.webp",
    fciGroup: 8,
    fciSection: "Retrievery",
    origin: "Veľká Británia",
    group: "Retrievery",
    size: "stredne veľký až veľký",
    weight: "25–34 kg",
    lifespan: "10–12 rokov",
    coat: "stredne dlhá, s podsadou",
    energy: 4,
    trainability: 5,
    family: 5,
    intro: "Citlivý a učenlivý rodinný pes, ktorý vyniká v spolupráci s človekom a jemnom pracovnom nasadení.",
    character: "Zlatý retriever býva priateľský a mäkší v komunikácii. Tvrdé metódy mu nesedia; prosperuje pri pokojnom, dôslednom tréningu.",
    needs: "Okrem pohybu potrebuje kontakt, aportovacie alebo pachové úlohy a pravidelnú starostlivosť o srsť a uši.",
    goodFor: ["rodiny", "canisterapiu", "aportovanie", "začiatočníkov ochotných učiť sa"],
    consider: ["náročnejšia srsť", "citlivosť na samotu", "zdravotný skríning chovu"],
    accent: "gold",
  },
  {
    slug: "border-kolia",
    name: "Border kólia",
    image: "/images/breeds/border-kolia.webp",
    fciGroup: 1,
    fciSection: "Ovčiarske psy",
    origin: "Veľká Británia",
    group: "Pastierske psy",
    size: "stredne veľký",
    weight: "12–22 kg",
    lifespan: "12–15 rokov",
    coat: "krátka alebo stredne dlhá",
    energy: 5,
    trainability: 5,
    family: 3,
    intro: "Mimoriadne vnímavý pracovný pes, ktorý sa učí rýchlo – vrátane vecí, ktoré ste ho učiť nechceli.",
    character: "Je citlivá na pohyb, zvuky aj náladu človeka. Bez kvalitného oddychu a usmernenia môže skĺznuť k naháňaniu alebo obsesívnemu správaniu.",
    needs: "Vyžaduje zmysluplnú prácu, schopnosť vypnúť a majiteľa, ktorý rozumie rovnováhe medzi aktivitou a regeneráciou.",
    goodFor: ["skúsených trénerov", "šport", "pastiersku prácu", "presné úlohy"],
    consider: ["veľká citlivosť", "potreba mentálnej práce", "riziko preťažovania", "nie vždy ideálny mestský pes"],
    accent: "blue",
  },
  {
    slug: "nemecky-ovciak",
    name: "Nemecký ovčiak",
    image: "/images/breeds/nemecky-ovciak.webp",
    fciGroup: 1,
    fciSection: "Ovčiarske psy",
    origin: "Nemecko",
    group: "Pastierske psy",
    size: "veľký",
    weight: "22–40 kg",
    lifespan: "9–13 rokov",
    coat: "krátka alebo dlhá, s podsadou",
    energy: 4,
    trainability: 5,
    family: 4,
    intro: "Všestranný, lojálny a dobre cvičiteľný pes s prirodzenou ostražitosťou a väzbou na svojho človeka.",
    character: "Dobrý nemecký ovčiak má byť sebavedomý a ovládateľný. Kvalita chovu a skoré skúsenosti výrazne ovplyvňujú jeho stabilitu.",
    needs: "Potrebuje systematický tréning, fyzickú kondíciu, pokojné zoznamovanie so svetom a kvalitný zdravotný výber rodičov.",
    goodFor: ["športovú kynológiu", "aktívnych ľudí", "služobnú prácu", "skúsené rodiny"],
    consider: ["zdravie pohybového aparátu", "ochranárske vlohy", "silné pĺznutie"],
    accent: "coral",
  },
  {
    slug: "madarska-vyzla",
    name: "Maďarská vyžla",
    image: "/images/breeds/madarska-vyzla.webp",
    fciGroup: 7,
    fciSection: "Kontinentálne stavače",
    origin: "Maďarsko",
    group: "Stavače",
    size: "stredne veľký",
    weight: "18–30 kg",
    lifespan: "12–14 rokov",
    coat: "krátka, bez výraznej podsady",
    energy: 5,
    trainability: 4,
    family: 4,
    intro: "Elegantný a veľmi kontaktný poľovný pes, ktorý spája vytrvalosť v teréne s potrebou blízkosti rodiny.",
    character: "Vyžla je jemná, živá a často doslova nalepená na človeka. Dlhá samota jej zvyčajne nerobí dobre.",
    needs: "Potrebuje beh, čuchanie, prácu v teréne a citlivé vedenie. Krátka srsť ju v zime chráni menej.",
    goodFor: ["beh a turistiku", "poľovnú prácu", "aktívnu rodinu", "pachové hry"],
    consider: ["ťažšie znáša samotu", "vysoká energia", "lovecký pud", "citlivosť na chlad"],
    accent: "gold",
  },
  {
    slug: "francuzsky-buldocek",
    name: "Francúzsky buldoček",
    image: "/images/breeds/francuzsky-buldocek.webp",
    fciGroup: 9,
    fciSection: "Malé molosoidné psy",
    origin: "Francúzsko",
    group: "Spoločenské psy",
    size: "malý",
    weight: "8–14 kg",
    lifespan: "10–12 rokov",
    coat: "krátka",
    energy: 2,
    trainability: 3,
    family: 4,
    intro: "Kompaktný spoločenský pes s komickou povahou, ktorého popularita priniesla aj vážne zdravotné riziká.",
    character: "Býva veselý, kontaktný a prispôsobivý. Neznamená to však, že nepotrebuje prechádzky, výchovu a primerané zamestnanie.",
    needs: "Prioritou je výber zdravšieho typu s voľným dýchaním, udržiavanie nízkej hmotnosti a dôsledná ochrana pred horúčavou.",
    goodFor: ["pokojnejší režim", "mestské bývanie", "ľudí s časom na spoločnosť"],
    consider: ["dýchacie ťažkosti", "zlá tolerancia tepla", "chrbtica a oči", "náklady na veterinára"],
    accent: "coral",
  },
  {
    slug: "australsky-ovciak",
    name: "Austrálsky ovčiak",
    image: "/images/breeds/australsky-ovciak.webp",
    fciGroup: 1,
    fciSection: "Ovčiarske psy",
    origin: "USA",
    group: "Pastierske psy",
    size: "stredne veľký",
    weight: "16–32 kg",
    lifespan: "12–15 rokov",
    coat: "stredne dlhá, s podsadou",
    energy: 5,
    trainability: 5,
    family: 4,
    intro: "Inteligentný a atletický pastiersky pes, ktorý potrebuje úzku spoluprácu, jasný režim a zmysluplné zamestnanie.",
    character: "Býva veľmi naviazaný na rodinu, vnímavý a ostražitý. Rýchlo sa učí, no bez vedenia si môže vytvoriť vlastnú prácu – napríklad kontrolovanie pohybu detí či bicyklov.",
    needs: "Potrebuje pravidelný tréning, pohyb, čuchové úlohy a vedomý nácvik odpočinku. Samotná fyzická únava nestačí.",
    goodFor: ["psie športy", "aktívnych ľudí", "pastiersku prácu", "skúsené rodiny"],
    consider: ["vysoká potreba práce", "citlivosť na podnety", "silné pĺznutie", "zdravotný skríning chovu"],
    accent: "blue",
  },
  {
    slug: "rotvajler",
    name: "Rotvajler",
    image: "/images/breeds/rotvajler.webp",
    fciGroup: 2,
    fciSection: "Molosoidné psy",
    origin: "Nemecko",
    group: "Molosoidné psy",
    size: "veľký",
    weight: "35–60 kg",
    lifespan: "8–11 rokov",
    coat: "krátka, hustá, s podsadou",
    energy: 4,
    trainability: 5,
    family: 4,
    intro: "Silný, sebavedomý pracovný pes s výraznou lojalitou, ktorý potrebuje zodpovedné vedenie a dobrú socializáciu.",
    character: "Vyrovnaný rotvajler býva pokojný, pozorný a ochotný spolupracovať. Jeho sila a ochranárske vlohy však nenechávajú priestor na nedôslednosť.",
    needs: "Potrebuje premyslenú socializáciu, tréning sebakontroly, primeranú kondičnú prácu a majiteľa, ktorý vie čítať správanie psa.",
    goodFor: ["skúsených majiteľov", "pracovnú kynológiu", "aktívny rodinný život", "systematický tréning"],
    consider: ["veľká fyzická sila", "ochranárske vlohy", "kĺby a srdce", "pravidlá držania v mieste bydliska"],
    accent: "forest",
  },
  {
    slug: "bernsky-salasnicky-pes",
    name: "Bernský salašnícky pes",
    image: "/images/breeds/bernsky-salasnicky-pes.webp",
    fciGroup: 2,
    fciSection: "Švajčiarske salašnícke psy",
    origin: "Švajčiarsko",
    group: "Salašnícke psy",
    size: "veľký",
    weight: "36–52 kg",
    lifespan: "7–10 rokov",
    coat: "dlhá, hustá, s podsadou",
    energy: 3,
    trainability: 4,
    family: 5,
    intro: "Mohutný, dobromyseľný rodinný pes, ktorý spája pracovný pôvod s pokojnejším domácim prejavom.",
    character: "Zvyčajne je priateľský, oddaný a citlivý na spôsob vedenia. Neskoršie dospievanie vyžaduje trpezlivosť a pokojné hranice.",
    needs: "Prospeje mu pravidelný pohyb bez preťažovania, kontakt s rodinou, starostlivosť o srsť a dôkladný zdravotný výber chovu.",
    goodFor: ["rodiny", "pokojnejšiu turistiku", "život s priestorom", "ľudí s časom na srsť"],
    consider: ["kratšia dĺžka života", "zle znáša horúčavu", "náročná srsť", "veľkosť a náklady"],
    accent: "gold",
  },
  {
    slug: "jack-russell-terier",
    name: "Jack Russell teriér",
    image: "/images/breeds/jack-russell-terier.webp",
    fciGroup: 3,
    fciSection: "Malé teriéry",
    origin: "Veľká Británia",
    group: "Teriéry",
    size: "malý",
    weight: "5–8 kg",
    lifespan: "13–16 rokov",
    coat: "hladká, drsná alebo lámaná",
    energy: 5,
    trainability: 4,
    family: 3,
    intro: "Malý telom, veľký odvahou a pracovným nasadením. Je rýchly, zvedavý a oveľa náročnejší, než naznačuje jeho veľkosť.",
    character: "Býva sebavedomý, hravý a samostatný. Teriérske vlohy sa môžu prejaviť intenzívnym lovom, kopaním aj hlasným komentovaním diania.",
    needs: "Potrebuje aktívny tréning, pachové hry, bezpečne vedený lovecký pud a dostatok oddychu po krátkych intenzívnych aktivitách.",
    goodFor: ["aktívnych ľudí", "nosework", "teriérske športy", "dôsledný tréning"],
    consider: ["silný lovecký pud", "hlasitosť", "samostatnosť", "konflikty s drobnými zvieratami"],
    accent: "coral",
  },
  {
    slug: "jazvecik",
    name: "Jazvečík",
    image: "/images/breeds/jazvecik.webp",
    fciGroup: 4,
    fciSection: "Jazvečíky",
    origin: "Nemecko",
    group: "Jazvečíky",
    size: "malý",
    weight: "približne 3,5–9 kg podľa variety",
    lifespan: "12–16 rokov",
    coat: "krátka, dlhá alebo drsná",
    energy: 3,
    trainability: 3,
    family: 4,
    intro: "Odvážny poľovný pes v nízkom tele, známy vytrvalosťou, výraznou osobnosťou a výborným nosom.",
    character: "Jazvečík býva bystrý, oddaný a samostatný. Jeho rozhodnosť nie je tvrdohlavosť bez príčiny, ale súčasť pracovného pôvodu.",
    needs: "Potrebuje čuchanie, primeraný pohyb, kontrolu hmotnosti a šetrné zaobchádzanie s chrbticou bez častých skokov z výšky.",
    goodFor: ["pachové hry", "menšie bývanie", "ľudí so zmyslom pre humor", "aktívne prechádzky"],
    consider: ["riziko problémov s chrbticou", "lovecký pud", "hlasitosť", "dôsledný tréning privolania"],
    accent: "gold",
  },
  {
    slug: "sibirsky-husky",
    name: "Sibírsky husky",
    image: "/images/breeds/sibirsky-husky.webp",
    fciGroup: 5,
    fciSection: "Severské záprahové psy",
    origin: "USA",
    group: "Špice a primitívne typy",
    size: "stredne veľký",
    weight: "15,5–28 kg",
    lifespan: "12–14 rokov",
    coat: "stredne dlhá, hustá dvojitá",
    energy: 5,
    trainability: 3,
    family: 4,
    intro: "Vytrvalý severský záprahový pes so spoločenskou povahou, veľkou potrebou pohybu a silnou samostatnosťou.",
    character: "Husky býva priateľský, zvedavý a tímový, nie však prirodzene poslušný. Rozhoduje sa podľa situácie a môže byť vynaliezavý únikár.",
    needs: "Potrebuje bezpečné prostredie, vytrvalostnú aktivitu v primeranom počasí, tréning spolupráce a rešpekt k jeho loveckému pudu.",
    goodFor: ["canicross a záprah", "aktívnych ľudí", "chladnejšie podnebie", "život s ďalšími psami"],
    consider: ["úteky a lovecký pud", "slabšie privolanie", "silné pĺznutie", "nevhodný pohyb v horúčave"],
    accent: "blue",
  },
  {
    slug: "beagle",
    name: "Bígl",
    image: "/images/breeds/beagle.webp",
    fciGroup: 6,
    fciSection: "Malé duriče",
    origin: "Veľká Británia",
    group: "Duriče",
    size: "malý až stredne veľký",
    weight: "9–14 kg",
    lifespan: "12–15 rokov",
    coat: "krátka, hustá",
    energy: 4,
    trainability: 3,
    family: 5,
    intro: "Veselý svorkový durič s mimoriadnym nosom, ktorý miluje spoločnosť, jedlo a dlhé skúmanie pachov.",
    character: "Bígl býva priateľský, hravý a spoločenský. Keď zachytí stopu, okolitý svet vrátane privolania môže na chvíľu prestať existovať.",
    needs: "Potrebuje bezpečné čuchové vyžitie, tréning privolania na dlhom vodidle, spoločnosť a dôslednú kontrolu hmotnosti.",
    goodFor: ["rodiny", "nosework", "aktívne prechádzky", "život s ďalším psom"],
    consider: ["hlasitosť", "silný lovecký pud", "riziko úteku", "sklon k priberaniu"],
    accent: "forest",
  },
  {
    slug: "anglicky-koker-spaniel",
    name: "Anglický kokeršpaniel",
    image: "/images/breeds/anglicky-koker-spaniel.webp",
    fciGroup: 8,
    fciSection: "Sliediče",
    origin: "Veľká Británia",
    group: "Sliediče",
    size: "stredne veľký",
    weight: "12–15 kg",
    lifespan: "12–15 rokov",
    coat: "stredne dlhá, hodvábna",
    energy: 4,
    trainability: 4,
    family: 5,
    intro: "Veselý a kontaktný sliedič, ktorý spája rodinnú prítulnosť s chuťou pracovať nosom v teréne.",
    character: "Býva radostný, citlivý a živý. Pracovné línie môžu mať podstatne vyššie tempo než výstavné a potrebujú viac zamestnania.",
    needs: "Potrebuje čuchové úlohy, pravidelný pohyb, šetrný tréning a dôkladnú starostlivosť o uši aj osrstenie.",
    goodFor: ["rodiny", "pachové športy", "aktívne prechádzky", "aportovanie"],
    consider: ["starostlivosť o srsť", "uši", "rozdiely medzi líniami", "citlivosť na tvrdé vedenie"],
    accent: "coral",
  },
  {
    slug: "whippet",
    name: "Whippet",
    image: "/images/breeds/whippet.webp",
    fciGroup: 10,
    fciSection: "Krátkosrsté chrty",
    origin: "Veľká Británia",
    group: "Chrty",
    size: "stredne veľký",
    weight: "9–18 kg",
    lifespan: "12–15 rokov",
    coat: "krátka, jemná",
    energy: 3,
    trainability: 4,
    family: 4,
    intro: "Elegantný a rýchly chrt, ktorý doma často pôsobí ako pokojný milovník pohodlia a vonku ako šprintér.",
    character: "Whippet býva jemný, tichý a citlivý na atmosféru. Má rád blízkosť, teplo a mäkké miesto na odpočinok.",
    needs: "Potrebuje bezpečnú možnosť šprintovať, bežné prechádzky, citlivé vedenie a ochranu pred chladom aj únikom za zverou.",
    goodFor: ["pokojnejšiu domácnosť", "mestské bývanie", "rekreačný coursing", "ľudí hľadajúcich tichšie plemeno"],
    consider: ["lovecký pud", "citlivosť na chlad", "krehkejšia koža", "privolanie pri zveri"],
    accent: "blue",
  },
];

export const categories = [
  { slug: "vycvik", label: "Výcvik", description: "Zrozumiteľný tréning bez nátlaku.", icon: "whistle" },
  { slug: "zdravie", label: "Zdravie", description: "Príznaky, prevencia a prvá pomoc.", icon: "heart" },
  { slug: "vyziva", label: "Výživa", description: "Miska bez mýtov a reklamných skratiek.", icon: "bowl" },
  { slug: "zivot-so-psom", label: "Život so psom", description: "Od šteniatka po pohodovú starobu.", icon: "paw" },
] as const;

export const categoryBySlug = Object.fromEntries(
  categories.map((category) => [category.slug, category]),
);

export function getArticle(slug: string) {
  return articles.find((article) => article.slug === slug);
}

export function getBreed(slug: string) {
  return breeds.find((breed) => breed.slug === slug);
}

export function getFciGroup(number: number) {
  return fciGroups.find((group) => group.number === number);
}
