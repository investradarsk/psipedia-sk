# UNIFIED PUBLIC DETAILS V2

## Audit a rozsah

Technické mapovanie začalo na main `e2fdd9de8f879259cbdaf1c8d04bf3d4b2b6e22c`.
Doplnené schválené referencie: desktop AB-VET, CACT, Beky a mobil AB-VET.
Predchádzajúca implementácia mala rozdielne šírky, samostatné hero layouty,
veľké full-width mapy, rozdielne karty a poradie sidebaru na mobile.
Priorita bola spoločný rámec, responzívne poradie, karty/CTA a zachovanie údajov.

| Šablóna | Spoločné prvky | Zachované špecifiká |
| --- | --- | --- |
| Adresár, všetky kategórie | DetailHero, karty, CTA, 1120 px grid | služby, expertíza, kvalifikácie, recenzie, dopyt, GEO gate |
| Podujatia | DetailHero, facts/section karty, CTA, grid | dátumy, stav, registrácia, Markdown, related, návrat |
| Kanonické adopcie | DetailHero, fakty, karty, CTA, grid | rezervácia, vek, aktuálnosť, podmienky, organizácia, galéria |
| Generic Help | DetailHero cez existujúci HelpDetailShell | všetky typové pohľady, urgent/resolved, bezpečnostné upozornenia a overenie zbierok |
| Stratené/nájdené | DetailHero, karty, CTA, grid | súkromie kontaktov, lifecycle, zdroje, bezpečná približná poloha |
| Organizácie | PublicProfileHero → DetailHero, karty, grid | kontakty, metódy pomoci, fundraising, adopcie, recenzie |

Rozšírené existujúce `detail-primitives`; žiadny nový dátový model ani editor.
Znovu použité: ImageDisplay, EventImage (vrátane označenej ilustračnej fallback
fotografie), Breadcrumbs, PublicActionLink, PublicFoundation, PublicLocationMap,
DirectoryContactForm, ProfileReviewSection, RelatedEntityLinks a typové Help views.
Mapový consent, renderovanie, navigačné oprávnenia a endpointy zostali zachované.

## Skutočné údaje a média

Tri primárne fixture záznamy sú anonymné read-only snapshoty verejného HTML/JSON-LD
z 18. 10. 2026. Zdrojové URL a presné hodnoty sú v
`tests/fixtures/unified-public-details-v2.json`. Nejde o D1 seed ani produkčný import.
AB-VET má v skutočnosti široké logo a inú adresu, kontakty a hodiny než návrh.
Beky má portrétovú fotografiu a menej vyplnených údajov než návrh. Tieto odlišnosti
sa zachovali. Nulová/neplatná hmotnosť sa iba nezobrazuje; dáta sa nemenia.
CACT odkazuje na externý klubový obrázok. Jeho získanie v tomto prostredí skončilo
HTTP 403, preto browser fixture preveruje pôvodný označený ilustračný fallback.
Nie je to dôkaz zlyhania obrázka pre bežného návštevníka produkcie.
Žiadne služby, program, kontakty, povaha psa ani nové mapové body neboli doplnené
podľa návrhov. Sekundárne varianty označené `Test` sú syntetické UI stavy.

## Overenie

Reprodukcia bez D1, produkčných zápisov a Google API:

```sh
npm ci
npx playwright install chromium
node --test tests/public-details-v2-ui.test.mjs
```

Lokálny Chromium možno zvoliť cez `DETAIL_TEST_CHROMIUM=/usr/bin/chromium`.
`DETAIL_TEST_SCREENSHOTS=.e2e-artifacts/unified-public-details-v2` uloží snímky.
Test používa skutočné komponenty a CSS; nahrádza iba Next platformové hranice,
read-only lost/found store a odpovede API. Neoveruje plný SSR/D1 routing.
Primárne snímky: 1440, 390, 375 CSS px, DPR 1. Sekundárne prípady: 1440/320 px.
Kontroly: overflow, desktop/mobile poradie, jediný H1, natural pomer strán,
prázdne médiá/údaje, neoverená zbierka, klávesnicový focus, axe, error/retry/success
dopytu s nezmeneným submissionKey a mapový consent bez produkčného Google načítania.

Súhrn výsledkov a limity vizuálneho porovnania: [design-qa.md](../../design-qa.md).
Existujúce integračné E2E workflowy zostávajú; nový izolovaný test je pridaný do CI.
Aktualizované staré E2E očakávanie photo-first na desktope zodpovedá schválenému
text-left/media-right rozloženiu. Testy nevynechávajú kontroly obsahu a kontaktov.

## Follow-up, mimo tohto PR

- Získať CACT externé médium a zopakovať snímku s úspešne načítaným originálom.
- Celorepozitárový TypeScript baseline obsahuje 698 existujúcich diagnostík;
  porovnanie identických základov neukázalo žiadnu novú diagnostiku.
- D1/SSR integračný test patrí existujúcim seeded CI workflowom; v tomto behu
  sa neaplikovala žiadna migrácia a produkčné dáta sa nezapisovali.
- Manuálne skontrolovať tri živé záznamy po prípadnom samostatne schválenom nasadení.

Žiadny merge, auto-merge, deployment, D1 migrácia ani produkčný zápis.
