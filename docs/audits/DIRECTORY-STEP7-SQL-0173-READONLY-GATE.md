# Adresár – krok 7/8: produkčný SELECT-only inventár SQL 0173 pred odpojením JSON

## Rozsah
Rozšírenie existujúceho manuálne spúšťaného auditu `Directory 0170 – read-only backfill inventory` (#1466) o **šesť už existujúcich tabuliek SQL 0173**:

| SQL 0173 tabuľka | Kontrola |
| --- | --- |
| `directory_profile_qualifications` | Poradie a obsah kvalifikácií proti existujúcemu `qualifications_json`; staré len v JSON zostávajú neoverené |
| `directory_profile_opening_hours` | Voľný text dňa 0 proti `Ordinačné hodiny` a historickým aliasom; rozpis dní 1–7 sa **neprepisuje** späť na text |
| `directory_profile_media` | Fotogaléria s poradím a deduplikáciou, limit 6; berie do úvahy osobitný kľúč chovateľskej stanice aj generickú galériu |
| `directory_profile_seo` | Jeden SEO/OG stav oproti `seo_json`, vrátane hodnoty `noindex` |
| `directory_profile_review_state` | Zhodný stav `Odkontrolované` a historického `unlock_pending`; SQL nesmie omylom vyzerať odomknuté |
| `directory_profile_quality_resolutions` | Jednotlivé potvrdené rozuzlenia kvality (status, checked_at), nikdy sa nedotýka iných polí |

Kontroluje tiež pôvodné SQL 0170 kategórie, fakty, filtre, kontakty, kanonické Services V3 a Notion potvrdené baseline. Ak ktorákoľvek požadovaná tabuľka či stĺpec chýba, audit skončí **fail-closed**. Schéma sa nedopĺňa automaticky.

## Bezpečnostný kontrakt
- Spustenie iba cez manuálny `workflow_dispatch`, vetva `main`, prostredie `production`, presný Cloudflare účet a D1 identita.
- Kontrolný text: `AUDIT-0170-BACKFILL-psipedia-sk-db` (existujúci, bez zmeny).
- Čisto `SELECT`: nepovoľuje `INSERT / UPDATE / DELETE / ALTER / DROP / CREATE`.
- Dva agregované snapshoty (pred/po) počítajú aj všetkých šesť 0173 tabuliek. Pri pravdepodobnom súbežnom zápise audit zlyhá a výsledok sa **nepovažuje za odobrenie cutoveru**.
- Report a GitHub logy smú obsahovať len počty, kategórie, typy problémov a malé vzorky interných ID; **žiadne adresy, telefóny, mená, SEO text, URL galérie ani JSON payloady**.
- Absencia záznamu či prázdna SQL relácia **nie je dôkaz výslovného vymazania**; zhodný report **nie je** dôkaz funkčnej parity Admin ↔ Notion ↔ verejný web.

## Ako spustiť
1. GitHub → `Actions` → `Directory 0170 – read-only backfill inventory` → `Run workflow`.
2. Vybrať vetvu `main` a vložiť potvrdenie `AUDIT-0170-BACKFILL-psipedia-sk-db`.
3. Po skončení otvoriť posledný beh, rozbaliť `Production D1 SELECT-only inventory` a stiahnuť artefakt `directory-0170-backfill-readonly-...` s `report.json`.
4. Až podľa skutočných nálezov naplánovať **bezstratové** doplnenie pre konkrétne polia. **Nikdy nevykonávať hromadný JSON→SQL UPDATE, ak záznamy nie sú overené.**

## Čo je ešte pred krokmi 7 a 8
Pred úplným vypnutím verejného `source_data_json` fallbacku treba overiť výsledky auditu, rozhodnúť konfliktné záznamy, opraviť zostávajúce runtime čítacie cesty Admin/partner/Notion/verejný web a potvrdiť funkčnú paritu. Nezávislá história editov jednotlivých polí sa ešte len musí integrovať; dve nejednoznačné zmeny toho istého poľa stále bezpečne hlásia konflikt. **PR #1448 nesmie byť zlúčený ako predčasný cleanup.**
