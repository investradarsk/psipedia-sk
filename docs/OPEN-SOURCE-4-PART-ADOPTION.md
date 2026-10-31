# Psipedia – spoločný open-source PR (4 časti)

Tento dokument sleduje **jeden Draft PR**. Každá ďalšia časť sa doplní na rovnakú vetvu; nejde o štyri samostatné PR.

## 1. TanStack Query – prvá dokončená implementačná etapa

- [x] Nainštalovaný a SHA512-locknutý `@tanstack/react-query@5.105.0`.
- [x] `AdminQueryProvider` len pre `/admin`: krátka pamäťová cache (stale 20 s, garbage collection 60 s), bez persistence a bez retry mutácií.
- [x] Admin Podujatia: kľúče podľa filtrov, stránky a Bratislava-dňa; zachovaná SSR prvá strana, oneskorené hľadanie, cancel signal, cache predchádzajúcej strany a explicitné obnovenie po úspešnej mutácii.
- [x] Admin Nastavenia → Notion: samostatné cache kľúče podľa kategórie, live test **iba na kliknutie** a opakovanie pri chybe.
- [x] Kontraktové testy vrátane aktualizácie existujúcich testov na nový model.
- [ ] CI: npm ci, TypeScript, build, lint, relevantné Node testy, admin E2E.
- [ ] Manuálny desktop/mobil smoke; porovnať počet requestov (pred/po) a vylúčiť stale údaje po editáciách.

### Bezpečnostné hranice

- Bez zmeny D1 schémy, Notion synchronizácie, publikačných pravidiel a existujúcich API.
- Cache zostáva iba v pamäti aktuálneho admin klienta. Žiadne ukladanie dôverných odpovedí do storage.
- Server a pôvodné editor/mutation endpointy sú naďalej zdrojom pravdy. Žiadne automatické retry zápisov.
- Neprenášať TanStack Query automaticky na všetky SSR zoznamy; najprv preukázať prínos na vybraných klientských obrazovkách.

## 2. Uppy – schválený zámer, **zatiaľ neimplementované**

- [x] Audit existujúcich uploaderov: jedna centrálna optimalizačná funkcia `uploadAdminImage` + `/api/admin/uploads` a `react-dropzone` vo zdieľanom výbere; galéria URL zostáva v kanonickom editore.
- [x] Uppy Core + DashboardModal + React pre viacobrázkové galérie; dodržiava pôvodný 8 MB limit, podporované formáty, sekvenčné uploady, náhľady, chyby a ručné uloženie galérie v editore.
- [ ] Rozšíriť Uppy aj na jednoobrázkové polia, kde sa dnes používa `AdminSingleImageUpload`, bez regresií editorov a dostupnosti.
- [ ] Pridať dôkaz vizuálu na desktope/mobile a potvrdiť galériu s viacerými obrázkami.
- [ ] Bez zásahu do existujúcich identifikátorov médií, ukladaných URL či publikovania; žiadna druhá media pipeline.
- [x] Balíky `@uppy/core@6.2.0`, `@uppy/dashboard@6.0.1`, `@uppy/react@6.0.0` plus závislosti uzamknuté v package-lock so SHA512.
- [x] Kontraktové testy na zachovanie pôvodnej upload API a galérie.
- [ ] Overiť CI build, E2E a bezpečné chovanie pri čiastočných chybách.

## 3. PhotoSwipe – schválený zámer, **zatiaľ neimplementované**

- [x] Audit: zdieľaná `PublicPhotoGallery` má štyri prezentačné varianty; PhotoSwipe bezpečne rozširuje iba `linked`, ostatné zostávajú nedotknuté.
- [x] Zdieľaný PhotoSwipe lightbox v `PublicPhotoGallery` pre odkazy adopcií a ďalšie prepojené galérie; pôvodné odkazy fungujú aj bez JavaScriptu.
- [ ] Po vizuálnom audite voliteľne rozšíriť galérie `breed`/`editorial`/`report` (ich existujúce crop/caption/alt šablóny sa teraz nemenia).
- [x] Zachované SSR `<img>` a `<a>` prvky, alt, zdroj a fallback bez zmeny dátového modelu.
- [ ] Overiť skutočný lightbox, klávesnicu a gestá na mobile cez E2E.

## 4. FullCalendar – schválený zámer, **zatiaľ neimplementované**

- [x] Audit verejného kalendára: vlastné SPA filtre, /api/public/events/calendar, typy, história prehliadača; mobilný kalendár ponechaný.
- [x] FullCalendar Standard (MIT) mesačná mriežka na desktope, slovensky, s rovnakými farebnými indikátormi typov a existujúcimi deň/mesiac odkazmi.
- [ ] Vizuálne vyladiť nový kalendár podľa desktop smoke screenshotov.
- [x] Navigácia a výber dňa používajú pôvodné klientské volanie a URL (popstate); mobilný kalendár sa nezmenil. FullCalendar používa vlastný natívny day link.
- [ ] Overiť klávesnicu, desktop/mobil a bez-full-reload v Playwright.
- [ ] Samostatná budúca možnosť: spoločné zobrazenie FB publikačných plánov, bez zásahu do existujúceho publikátora; nie súčasť prvého verejného kalendárneho rozsahu.
- [x] Použité iba MIT balíky FullCalendar core + daygrid + React; žiadne platené Resource/Timeline pluginy.

## Merge politika

**Nemergovať po časti 1.** Dopĺňať len tento PR, označovať hotové etapy a skontrolovať celý súbor zmien pred konečným merge. D1 produkčné migrácie a nasadenia mimo PR nespúšťať.
