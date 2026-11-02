# Psipedia – register komponentov a šablón

## Kde sa nachádza

V prihlásenej administrácii: **Nastavenia → Komponenty a šablóny** (/admin/komponenty). Register je **iba na čítanie** a nemení verejný web.

## Ako sa aktualizuje

- Pri npm run dev a npm run build sa spustí npm run components:generate.
- Generátor analyzuje app/, components/, lib/ a hooks/ cez TypeScript AST; zapisuje lib/generated/component-registry.json.
- Admin načíta kompilovanú kópiu pri nasadení. V produkcii sa nečítajú súbory ani nevolá GitHub API.
- V commite je len prázdna východisková štruktúra. Prvý bežný build ju naplní.
- Priame vinext build bez npm skriptov nevyvolá generátor; najprv spusti npm run components:generate.

## Interpretácia údajov

- Stránka = súbor app/**/page.tsx; dynamická trasa sa počíta ako jeden stránkový vstup.
- Komponent = .tsx/.jsx v components/ alebo app/**/components či app/**/_components.
- Zdieľaný = staticky dosiahnuteľný z dvoch alebo viacerých stránkových vstupov.
- Priamy importér = súbor, ktorý daný súbor staticky importuje alebo reexportuje.
- Bez statického importéra = dôvod na ručnú kontrolu, nie pokyn na vymazanie.
- Kandidát duplicity = totožný základný názov súboru, nie dokázaná vizuálna duplicita.

Generátor prechádza aj tranzitívne importy a reexporty a zvláda cykly. Neodhalí všetky dynamické importy, require(), runtime mapovanie, použitie pomocou konvencií, CSS podobnosť ani vizuálne totožné kópie s inými názvami.

## Otvorené open-source nástroje

- npm run graph:react – ReactGraph 0.1.9, vytvára reactgraph.json. Lokálny prehliadač: npm exec --yes --package=@reactgraph-ui/core@0.1.9 -- reactgraph serve .
- npm run graph:dependencies > component-dependencies.json – Dependency Cruiser 18.7.0, detailný JSON graf závislostí.
- npm run test:component-registry – testy statického mapovania.

Oba externé CLI sú voliteľné a pri prvom spustení vyžadujú prístup k npm registry. Nie sú súčasťou produkčného buildu.

## Bezpečnosť a výkon

- /admin/komponenty je chránená existujúcim requireAdminPageUser.
- Nevzniká žiadny verejný JSON endpoint ani D1 migrácia.
- Sken prebieha počas buildu, nie pri každej návšteve.
- Zmeny zdieľaných komponentov posudzuj aj z pohľadu mobilu; používanie v konkrétnej route neodlišuje CSS breakpointy.

## Rodiny a kandidáti podobnosti – V2
- Hero, bannery, CTA, filtre, karty a podkategórie sú zoskupené podľa pomenovania a účelu komponentov.
- Kandidáti sú určení **na kontrolu**, nie na automatické mazanie alebo spájanie. Nepredstavujú dôkaz vizuálnej duplicity.
- Pri statických verejných stránkach register ponúkne skutočný klikateľný odkaz na cestu, ktorá existuje v zdrojových stránkach. Pri `/[slug]` uvádza len vzor, pretože bez databázy nepozná konkrétne profily a články.
- Technické súbory a importéri sú schované pod „Technické informácie“.
- Zostáva iba na čítanie, bez D1 migrácie a bez zásahu do mobilného dizajnu verejného webu.

## Vizuálne náhľady existujúcich komponentov (V3)
- V **Nastavenia → Komponenty a šablóny** sa na vrchu registra zobrazujú rozbaľovacie **živé náhľady**. Ide o vykreslenie pôvodných React komponentov so schváleným CSS, nie o ilustračný obrázok ani napodobeninu.
- Prvé náhľady: promo, fotografický, informačný, kontextový s fotografiou, nahlásenie psa, rýchla pomoc, záverečná výzva, článková a partnerská CTA, odporúčací banner, spoločný obal, tlačidlá a formulárové prvky.
- Každá ukážka má explicitne označený **vzorový obsah**. Nie sú to údaje žiadneho reálneho profilu.
- Interakcie vo vnútri ukážky sú vypnuté pomocou \`inert\`, \`aria-hidden\` a \`pointer-events: none\`. Odkazy sa nedajú aktivovať myšou ani klávesnicou; ide výhradne o čítanie.
- Ukážka používa skutočnú šírku dostupnej oblasti; nie je simulátor mobilného breakpointu. Na overenie mobilného layoutu treba otvoriť admin na mobilnom zariadení.
- Žiadne nové verejné route, databázové úpravy, Notion, publikovanie ani závislosti. Zmena je iba v existujúcom autentifikovanom admin registri.

## Vizuálne náhľady a pokrytie – V4 (nadväznosť na PR #1169)
- Náhľady sa rozšírili o skutočné zdieľané hlavičky, karty, podkategórie, navigáciu, vyhľadávanie, CTA tlačidlá, stránkovanie, prázdne stavy a upozornenia.
- Dva odlišné počty: **počet ukážok** (niekoľko variantov na súbor) a **počet súborov s náhľadom** (prienik s aktuálnym generovaným registrom).
- Filter **Živý náhľad** rozlišuje súbory s reálnym náhľadom a bez neho. Pri každom súbore s ukážkami možno prezerať jeho varianty, pri ostatných sú k dispozícii skutočné statické stránky použitia alebo vzor dynamickej trasy.
- Načítanie skutočného React komponentu prebehne až po rozbalení ukážky. Neaktívne ukážky nespúšťajú nákladné komponenty.
- Zoznam komponentov už nie je obmedzený iba na prvých 100: možno ho rozbaliť na úplný výsledok filtra.
- **Nie je to automatický renderer ľubovoľného React súboru.** Mnohé komponenty vyžadujú produkčné údaje, serverové závislosti alebo klientské kontexty. Pri nich register pravdivo ukazuje stav „bez bezpečného náhľadu“ a stránky použitia, nie falošný vizuál.
- Nie je to 100 % pokrytie živými náhľadmi všetkých súborov. Stav pokrytia sa priebežne počíta z registra, takže chýbajúce súbory sú viditeľné.
- Žiadne zmeny verejného webu, publikovania, mobilného CSS, D1 ani Notion.
