# Psipedia.sk – zjednotenie administrácie, krok 13/18

**Dátum:** 14. 11. 2026  
**PR:** #1369 (Draft). **Bez merge, deployu, API alebo produkčnej mutácie.**

## Rozsah

Partneri (účty, prevzatie profilov, nové profily, úpravy profilov a overenia správcov), profilové recenzie a moderácia, spätná väzba čitateľov k článkom. Nezavádza sa druhá databáza podnetov; existujúci editor spätnej väzby sa nachádza na `/admin/hodnotenia`, správa používateľských recenzií na `/admin/recenzie-profilov`.

## Zdrojovo potvrdené nedostatky

1. Partneri mali 6 veľkých metrických kariet, nekompaktné filtre, jednoduché textové linky v agende „Vyžaduje pozornosť“ a nepravidelnú 5-stĺpcovú tabuľku.
2. Štyri partnerské fronty používali technické enumy ako `PENDING_REVIEW`, `SUBMITTED`, `DIRECTORY_PROFILE`, `STALE_BASE`, `HIGH` aj vo viditeľných štítkoch. To isté platilo o popisoch `canonical`, `OWNER membership` a `duplicate scan`. Nemá sa meniť ich **value** v `select` ani argumenty serverových filtrov.
3. Moderácia recenzií už mala slovenské stavové labely, bezpečný inline schvaľovací workflow a serverové stránkovanie. Hlavnou rezervou bol vzhľad filtrov, karty a dostupnosť tlačidiel.
4. Podnety k článkom mali vhodné pôvodné stavy, ale rozličné rozmery kariet a akčných ovládačov. Rýchle statusové zmeny sú dátové operácie; testy ich nesmú vykonávať.

## Implementácia

### Partneri a ich fronty

- Nový **čisto prezentačný** helper `lib/admin-partner-labels.ts` obsahuje slovenské preklady stavov, typov profilov, rolí, rizikových signálov a odhadu duplicity; neznámu hodnotu vracia nezmenenú, takže sa nestratia nové enumy. Žiadne zmeny query parametrov alebo serverových kontraktov.
- `/admin/partners`: kompaktné metriky, 44px priame pracovné odkazy, nové prístupné označenie `role=search`, prehľadnejší zoznam partnerov s `role=list/listitem` namiesto neúplnej ARIA tabuľky; stránkovanie aj počet záznamov zostávajú.
- `/admin/partners/claims`, `/submissions`, `/changes`, `/verifications`: jednotná prístupná mriežka filtrov a kompaktnejšie karty, slovenské typy a stavy, `data-admin-community-list`, zachované kategórie, dátumy a všetky pôvodné detaily.
- Detail prevzatia a návrhu nového profilu: slovenské vysvetlenia, stavy, konflikty a výsledky kontroly duplicít. `AdminPartnerClaimActions`, `AdminPartnerNewProfileActions` a `CandidateLinkButton` zostávajú s pôvodnými autorizáciami a potvrdeniami.
- CSS je v už existujúcom `app/admin/partners/partners.css`, používa spoločné admin tokeny, lokálne komponentové triedy, 44px ovládanie, 16px mobilné filtre, grid 1 stĺpec pod 760px a zrozumiteľné focus stavy.

### Profilové recenzie

- `/admin/recenzie-profilov`: filtrovanie má prístupný search landmark a spoločný `data-admin-list-filters`. Zobrazuje sa počet recenzií na aktuálnej strane, karta má `data-admin-community-review`.
- `reviews.css`: menšie medzery, štítky, 44px detail a lepšie zalamovanie na mobiloch. `AdminProfileReviewInlineApproval` zostáva **len na desktope**; jeho ovládacie prvky majú 44px.
- Zachované `profileReviewStatusLabel` a `profileReviewEntityTypeLabel`, `AdminPagination`, detail s náležitosťami/overením, a `window.confirm` + optimistic status guard pri schvaľovaní; žiadne nové rýchle odmietnutie či odstránenie bez dôvodu.

### Podnety k článkom

- `/admin/hodnotenia`: prehľadnejšie a kompaktnejšie karty, reakcie čitateľov, texty a hlavné pracovné odkazy. CSS opt-in cez `data-admin-content-module="reader-feedback"`, akcie min. 44px, dobre viditeľné focus stavy.
- `AdminInlineRowActions`, `AdminInlineCellSelect`, stavy `new/reviewing/resolved/dismissed`, API a `busyId` ochrana sa nemenia.

## Testovanie

- `tests/admin-community-step13.test.mjs`: šesť read-only zdrojových kontraktov pre preklady a zachovanie enums, klientské filtre, moderáciu, chránené schvaľovanie, feedback a responzívne CSS.
- `tests/e2e/admin-community-step13.spec.ts`: izolovaný localhost, bez zápisov; partnerské účty, 4 fronty, profilové recenzie a spätná väzba na 320/390/768/1440px. Kontroluje šírku dokumentu, ovládacie prvky a dostupnosť detailu, **nikdy nekliká na schvaľovanie/odmietanie alebo zmenu stavu**.
- Nové súbory pripojené k `.github/workflows/admin-typography-contracts.yml`.

## Pred merge

- [ ] Zdrojové testy, TypeScript a Playwright na **poslednom** HEAD PR #1369.
- [ ] Skutočné autentifikované mobilné a desktopové screenshoty, dlhé názvy/emaily, prázdne a plné stavy; iOS Safari.
- [ ] Zosúladiť #1369 s `main` (pri vstupe do kroku bola vetva 55 commitov za main) a preveriť konflikty.
- [ ] Vlastník musí výslovne povoliť merge.

**Ďalej 14/18:** Gemini, Facebook a tvorba sociálneho obsahu v administrácii.
