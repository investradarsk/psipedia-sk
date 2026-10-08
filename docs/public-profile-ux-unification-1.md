# PUBLIC-PROFILE-UX-UNIFICATION-1 — audit a rozsah

Východiskový main: `07730b521bfe5ff92f1d0cc8e9b0f9f5d17e2f17`.

## Skutočné profilové detaily

- `/adresar/[category]/[slug]`: jeden `DirectoryProfileDetail` pre všetky publikované služby a kategórie (vrátane veterinárov, trénerov a chovateľských staníc).
- `/organizacie/[slug]`: `OrganizationProfileDetail`, verejná organizácia vrátane adopcií a zbierok.
- `/pomoc-psom/[category]/[slug]`, adopcie a stratené/nájdené psy: prípady pomoci, nie profily poskytovateľa; zachované.
- Plemená: encyklopedické detailové stránky odlišného typu; bez zásahu.
- Detail podujatia a článku: zámerne nedotknutý.

## Zjednotenie

`PublicProfileHero` poskytuje spoločnú typografiu, badges, breadcrumb, lokalitu, obrázok, CTA a responzívne obmedzenú výšku hlavného obrázka. `PublicProfileContentLayout` používa v oboch profiloch rovnaké zobrazenie kontaktov a hlavného obsahu: desktop dva stĺpce, mobil kontakty prvé, až potom obsah. Zachováva existujúce detailové primitives a ich filtre prázdnych údajov.

Organizácia využíva existujúci `presentation.imageUrl`, predtým nevykresľovaný. Primárna akcia je existujúci web, telefón, e-mail, podpora alebo adopcie podľa dostupných údajov. Adresár si ponecháva `#kontakt` s existujúcim dopytovým formulárom.

Bez zmien databázy, adresnej presnosti, routingu, SEO politík, Google Maps workflow alebo administrácie.

## Regresie

- Node zdrojové kontrakty: `tests/organization-profile-route.test.mjs`.
- Playwright: nové scenáre v `tests/e2e/services-detail-shell.spec.ts` a `tests/e2e/organization-profile.spec.ts` (320/390/1440 px, reálne fixture profily, CTA, poradie, accessibility, overflow, bez obrázka a kontaktu). Tieto testy sú automaticky spúšťané existujúcimi oddelenými CI workflowmi s príslušnými D1 fixtures.

Pred merge kontrolovať CI, desktop/mobile vizuálny diff a fyzický iPhone Safari; tieto výsledky nie sú deklarované ako PASS bez vykonania.
