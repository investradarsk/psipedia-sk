# Plemená — krok 4: rozbor 12 401 rozdielov a izolovaný test oboch smerov

## Dôležitý význam 12 401
Toto číslo je súčet rozdielov medzi **dvoma nezávislými historickými hodnotami uloženými pri inicializácii kroku 2** (Notion snapshot / Admin snapshot). Nie je to 12 401 nových udalostí, 12 401 chybných prenosov ani pokyn okamžite prepísať údaje.

## Bezpečný produkčný audit
Zmena rozširuje existujúci, manuálny a read-only GitHub workflow:
`Production Breed Workcopy Step 3 Postflight (read-only)`.
Po merge ho opätovne spusti z vetvy `main` s:
`AUDIT-BREED-BASELINES-344`.

V reporte bude `differenceAnalysis`: počty pri každom poli (`byField`) a skupine (`byGroup`), vrátane:
- iba Notion vyplnené, iba Admin vyplnené, dve nezhodné neprázdne hodnoty
- odlišná reprezentácia dvoch prázdnych hodnôt
- nezhodný dátový typ
- polia, ktoré ešte nie sú v bežnom novom synchronizátore (fotky, galéria, vzťahy, športy)
- množstvo plemien s aspoň jedným rozdielom

Report zobrazuje iba agregáty a názvy databázových polí; **žiadne pôvodné texty, fotografie ani osobné údaje**. Na základe poradia polí sa určí priorita opráv parserov/pravidiel ešte pred cutoverom. Ak niektorý z 344 záznamov chýba, má chybný formát alebo status, read-only audit skončí s chybou.

## Obojsmerný test — len izolovaná simulácia
CI testuje:
1. Notion → Admin: explicitne zmenená property (webhook ID) vyberie **len vlastné pole**; prázdny text nič nemaže.
2. Admin → Notion: zmeny pred/po `Uložiť` vyberú len skutočne upravené pole. PATCH plán tvorí **jedinú Notion property**, ostatné hodnoty zostávajú bez dotyku.
3. Nesúlad revízie alebo nezávislá zmena cieľového Notion poľa sa odmietne.
4. Systémové ID, FCI identita a blokované médiá/vzťahy sa neprenášajú cez všeobecný textový mechanizmus.

**Táto simulácia nemení reálne Notion stránky ani D1** a ešte netvrdí, že je produkčná obojsmerná synchronizácia end-to-end overená.

## Hranica ďalšieho kroku
Existujúci runtime vyžaduje `status=ACTIVE` pre *všetkých 344* a zakazuje súčasné použitie starého a nového synchronizátora. Preto nie je bezpečné „zapnúť len jedno plemeno na produkcii“ bez osobitne navrhnutého pilotného režimu.

Po analýze po jednotlivých poliach pripravte a otestujte samostatný pilotný mechanizmus alebo bezpečné testovacie prostredie s Notion + D1, ktoré umožní skutočný zápis oboma smermi a rollback **bez globálneho cutoveru**. Až po jeho úspechu a výslovnom schválení nasleduje príprava prepnutia.

Do toho momentu:
- `NOTION_BREED_SYNC_ENABLED=true`
- `NOTION_BREED_WORKCOPY_SYNC_ENABLED=false`
- `NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED=false`
- `NOTION_BREED_WORKCOPY_BASELINE_ENABLED=false`
- redakčné automatizácie plemien zostávajú pozastavené.
