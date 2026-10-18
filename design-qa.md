# Design QA — UNIFIED PUBLIC DETAILS V2

**final result: blocked**

Implementácia a automatické kontroly sú pripravené na review. Úplné vizuálne
potvrdenie ostáva otvorené: originálny externý obrázok CACT sa v tomto prostredí
nedal získať (HTTP 403) a referencie vložené v konverzácii nie sú dostupné ako
lokálne obrazové súbory na spoločný normalizovaný porovnávací vstup. Nevydávame
samostatne otvorené snímky za pixelové side-by-side porovnanie.

## Zdroje a snímky

Vizuálna pravda: používateľské obrázky v konverzácii — najnovší desktop AB-VET,
CACT Kosorín, Beky, mobil AB-VET. Prvý desktop AB-VET bol nahradený novším.
Desktop referencie majú približne 1448 × 1086 px; mobilná referencia obsahuje
mobilný obsah v širšom plátne. Bez pôvodných súborov nie je možné potvrdiť jej
CSS viewport/DPR ani presnú normalizáciu. Referencie sú rozloženie, nie dáta.

Implementačné snímky: `docs/unified-public-details-v2/screenshots/`;
primárne `directory`, `event`, `adoption` pri 1440, 390 a 375 CSS px, DPR 1.
Plné výšky sa líšia podľa skutočného obsahu a prirodzených pomerov fotografií.
Sekundárne syntetické stavy bez fotografie sú jasne pomenované `Test`.
Lokálne opakovateľný výstup: `.e2e-artifacts/unified-public-details-v2/`.

## Kontrola povrchov a iterácie

1. Prvé browser snímky ukázali zdedené serif písmo aj pre hlavný text a príliš
   oddelenú mapu. Oprava: scoped sans-serif rodina detailu, mapa v rovnakej karte,
   kompaktný kontaktný formulár. Nové snímky po oprave sú uložené v priečinku vyššie.
2. Typografia: spoločný Georgia nadpis, sans-serif obsah, spoločná mierka H1,
   H2, CTA a meta textu. Existujúci hlavičkový komponent sa nemenil.
3. Rozloženie: maximálne 1120 px; desktop text/media 1.5:1, obsah/sidebar 2:1;
   mobile obrázok pred textom a jeden stĺpec. Kontrolované aj 375 a 320 px.
4. Farby: lokálne detail tokeny, teplé svetlé pozadie, tmavozelené CTA,
   jemné hranice, radius 12 px, sémantické amber upozornenia. Axe kontroly prešli.
5. Obrázky: AB-VET skutočné široké logo a Beky skutočný portrét v `natural`.
   Browser numericky overuje zachovanie pomeru strán; nechýbajúce obrázky sa
   nenahrádzajú mockupom. Crop/blur varianty používajú existujúci ImageDisplay.
   CACT screenshot zobrazuje pôvodný označený ilustračný fallback po chybe siete.
6. Obsah: skutočné verejné hodnoty, bez fiktívneho programu či vlastností psa.
   Neznáma hmotnosť 0 kg sa nezobrazuje. Beky zostáva upozornenie na aktuálnosť.
   Mapa pred súhlasom zostáva consent gate, nie obrázok mapy z návrhu.

Plný pohľad aj čitateľné regióny hero/CTA, kontaktov a formulára boli otvorené
v browser snímkach. Toto je kontrola implementácie; formálny spoločný obrazový
vstup source+implementation chýba a nie je označený za úspešne vykonaný.

## Automatické overenie

- Playwright na skutočných komponentoch/CSS: 43 kombinácií šablóna/šírka,
  bez horizontálneho overflow; jeden H1; desktop/media-right a mobile/media-first;
  axe WCAG A/AA; klávesnicový focus; prázdne obrázky a polia; rezervácia a stavy.
- Reálny DirectoryContactForm s izolovaným API: chyba zachová vstup,
  opakovanie zachová submissionKey, úspech vymaže vstup. Pôvodný endpoint/payload.
- Existujúci mapový consent pred/po kliknutí; bez plateného Google requestu.
- Kontrola JS pageerror pri každej kombinácii. API odpovede sú iba fixture.
- Build, lint, 70 entity/SEO kontraktov, 12 detail kontraktov, 14 structured-data,
  9 social-metadata a 3 CSS-scope testy. Úplný TypeScript má rovnakých 698
  diagnostík ako nezmenený základ; žiadna nová.

Nezamieňať s plným SSR/D1 integračným testom ani produkčným testom endpointov.
Existujúce seeded Playwright workflowy sa zachovali a nový izolovaný test beží v CI.

## Zostávajúce kroky vizuálneho potvrdenia

- Zopakovať CACT s dostupným originálnym externým obrázkom.
- Vytvoriť normalizovaný spoločný vstup zo zdrojových referencií a finálnych snímok
  pre konečné schválenie vizuálnej zhody. Bez toho zostáva formálny výsledok blocked.
- P3: prípadné doladenie informačnej hustoty podľa skutočne vyplnených profilov.

Žiadny merge ani deployment sa nevykonal.
