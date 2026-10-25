# PSIPEDIA.SK — Bod 1: audit duplicitných admin komponentov

**Stav:** auditná dokumentácia, bez runtime úprav.  
**Podklad:** `main` pri audite 0a9ea77c77913175d24c0d463e8f272da4d41e6a; kľúčové potvrdenia opätovne overené na b3fd0cb96d40f52a4c8bb08a175baa551acf03c6.  
**Východisko:** PR #1040 je MERGED. Jeho zdieľané prvky sú súčasťou hlavnej vetvy; netvoriť ich znova.

## 1. Rozsah a metodika

- GitHub strom: **105** admin route súborov `app/admin/**/page.tsx`, **124** súborov `components/admin-*.tsx`. Toto NIE JE počet duplicít.
- Manuálne porovnaných **40 vybraných komponentov**: kanonické editory, dashboardy, partnerská moderácia a shared UI. Audit je presný pre nižšie uvedené prípady; netvrdí, že sme manuálne prečítali každý súbor repozitára.
- Pridaný read-only skript `scripts/admin-duplication-inventory.mjs`: skenuje všetky komponenty `admin-*.tsx` a admin stránky, vypisuje potenciálne opakované vzory, ich súbory a riadky. `node scripts/admin-duplication-inventory.mjs` alebo `node scripts/admin-duplication-inventory.mjs --json`. **Lexikálny výskyt nie je dôkaz duplicity.**

## 2. Potvrdené nálezy s adresami

| ID / priorita | Opakovaná funkcia | Aktuálne príklady v kóde | Cieľový spoločný komponent a riziko |
| --- | --- | --- | --- |
| A1 P1 | Natívne potvrdzovanie nevratných operácií | `admin-help-dashboard.tsx:136` (trvalé odstránenie), `admin-service-catalog-workspace.tsx:96` (archivácia), `admin-partner-event-actions.tsx:9` (rozhodnutie) | `AdminDestructiveConfirmDialog`. Zachovať presný endpoint, payload, disabled počas requestu, Escape/zrušenie bez mutácie. |
| A2 P1 | Natívne potvrdzovanie rozhodnutí | `admin-data-quality-dashboard.tsx:226`, `admin-missing-quality-dashboard.tsx:76`, `admin-automation-finding-review.tsx:27-32` | Kanonický zdieľaný dialóg a pôvodné moderátorské bezpečnostné podmienky. Nerozšíriť automatické schvaľovanie. |
| A3 P1 | Zahodenie rozpracovaných zmien | `admin-service-catalog-workspace.tsx:179` (celý editor), `admin-directory-editor.tsx:537` (len kategóriové filtre) | Existujúci `EditorUnsavedChangesGuard` alebo vhodný variant; **zmena časti polí nie je totožná s odchodom z editora**. |
| B1 P2 | Tlačidlá rovnakých akcií cez viac implementácií | `admin-article-editor.tsx`, `admin-help-editor.tsx`, `admin-event-dashboard.tsx` miešajú natívne button a `AdminActionButton`; `admin-navigation-editor.tsx` a `admin-lost-found-editor.tsx` používajú vlastné tlačidlá | `AdminActionButton` len pre skutočne kompatibilné akcie. Zachovať `type=submit`, disabled, loading, navigáciu, 44px ovládanie. Samotný HTML button ešte nie je bug. |
| B2 P2 | Stav uloženia, chyba a ochrana formulára | `admin-adoption-editor.tsx`, `admin-help-editor.tsx`, `admin-lost-found-editor.tsx` už používajú zdieľaný feedback/guard. `admin-puppy-area-editor.tsx` a `admin-service-catalog-workspace.tsx` majú odlišné vykreslenie | Preveriť kompatibilitu s `AdminFormFeedback`, `EditorUnsavedChangesGuard` a `EditorActionBar`. Nenarušiť existujúce potvrdenia a serverové validácie. |
| C1 P2 | Filtre a vyhľadávanie | `admin-event-dashboard.tsx:255-260` má stavové selecty, `admin-help-dashboard.tsx:173-176` má GET filtre, `admin-lost-found-dashboard.tsx:21` GET, `admin-organization-publication-dashboard.tsx:180-184` GET | Zdieľať kompatibilnú prezentáciu a stavové pomocné funkcie; **nenútiť** klientsky/serverový model na všetky agendy. Zachovať query parametre, súbeh filtrov a reset stránkovania. |
| C2 P2 | Tabuľky, výber, stránkovanie | `admin-directory-dashboard.tsx:189` a `admin-organization-publication-dashboard.tsx:262` používajú `AdminPagination`; `admin-adoption-dashboard.tsx`, `admin-lost-found-dashboard.tsx` majú vlastné tabuľkové rozhrania | Identifikovať skutočne identické stránkovanie, vyhodnotiť `AdminPagination`, `AdminBulkSelection`. Zachovať prístupové oprávnenia a význam bulk výberu. |
| D1 P2 | Nahrávanie fotografií a galérie | `AdminSingleImageUpload` už existuje v článkoch, plemenách, Adresári, organizáciách, podujatiach, Pomoci psom, e-shopoch a ďalších. `AdminPhotoGallery` / dnd-kit pokrývajú kompatibilné galérie | Overiť zvyšné miestne implementácie pred ich odstránením. Nezjednocovať rozdielne dátové schémy: obrázok ≠ galéria; zachovať R2 kľúče, metadáta, výrezy. |
| D2 P3 | Príprava textu | `AdminLexicalAppendButton` už zdieľa bezpečné dopĺňanie textu; Články majú vlastný blokový obsah | Zrušiť iba dokázane redundantné wrappery. Nemeníť článkový AST bez bezstratového prevodu. |
| E1 P3 | Nadbytočné CSS, helpery a staré komponenty | Zmiešané historické a shared renderovanie v mnohých editoroch; samotný výskyt nezaručuje mŕtvy kód | Najprv import graph a regresný kontrakt; až potom vymazanie skutočne nepoužívaných implementácií. |

## 3. Čo už je zjednotené — NEROBIŤ znova

- `AdminActionButton`, `AdminDestructiveConfirmDialog`, `AdminModalDialog`.
- `AdminFormFeedback`, `EditorUnsavedChangesGuard`, `useAdminUnsavedFormLinks` pre kompatibilné formuláre.
- `AdminSingleImageUpload`, `AdminPhotoGallery`, spoločné dropzone/dnd-kit podľa typu galérie.
- `AdminPagination`, `AdminBulkSelection` tam, kde sa zhoduje dátový kontrakt.
- Voliteľný Lexical append; nekonvertovať automaticky iné formáty.

## 4. Ďalšie body podľa dohody — zatiaľ BEZ implementácie

- [x] **Bod 1:** audit zdrojov, zdokumentované prípady, priority a read-only inventarizácia (toto PR).
- [ ] **Bod 2:** zjednotenie formulárov, ovládania, potvrdení a ochrany tam, kde ide o rovnaký kontrakt (A1–A3, B1–B2).
- [ ] **Bod 3:** obrazy a textové editory (D1–D2), bez dátových migrácií.
- [ ] **Bod 4:** filtre, tabuľky, stránkovanie a výber (C1–C2), bez zmeny významu parametrov.
- [ ] **Bod 5:** odstránenie dokázateľne nepoužívaného kódu, lint/build, E2E mobil 320/390 a desktop, regresná akceptácia.

## 5. Bezpečnostné a akceptačné pravidlá

1. Každá ďalšia zmena musí pomenovať starú a novú implementáciu, zachované props, API a test.
2. Žiadne nové funkcie, vizuálny redesign, Cloudflare/D1/R2/Notion zmeny ani automatický merge.
3. Nerobiť plošné vymazanie podľa grep výstupu: potvrdenie, tlačidlo, filter alebo tabuľka môžu mať odlišnú doménovú sémantiku.
4. Tento audit je **príprava**. V bode 1 nebol odstránený žiadny produkčný duplikát; to sa vykoná postupne v bodoch 2–5.
