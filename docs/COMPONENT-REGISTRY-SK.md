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
