# Adresár 3/4 – priebežné SQL zápisy služieb a zobrazenia obrázkov

Dátum: 20. 11. 2026. Po produkčnom úspešnom `STEP3_MISSING_PROFILES_STAGED` máme jeden nový SQL sidecar receipt pre profil #1723; staršie receipty pri #118 a #231 už medzitým stratili zhodu `source_revision`.

## Problém
Jednorazový import `#1491` a doplnenie `#1497` sú STAGED snímky. Pri ďalšom bežnom uložení v Admine/Notion sa `directory_profiles.services_json` a `thumbnail_display_json`/`detail_display_json` môžu zmeniť bez priebežného SQL zrkadla v nových relačných tabuľkách. Takéto nové tabuľky sa nesmú považovať za autoritatívne len na základe úspešného importu.

## Tento PR
- Rozširuje kanonický `createManagedDirectoryProfile` a `updateManagedDirectoryProfile` o priebežný **transakčný D1 batch**.
- Výslovne uložený zoznam voľnotextových služieb aktualizuje `directory_profile_service_texts` (bez zásahu do Services V3).
- Výslovne upravené nastavenia miniatury/detailu zapisuje do `directory_profile_image_display_settings`.
- `[]` vymaže iba príslušné služby; `null` vymaže len príslušné nastavenie obrázka; **vynechané pole nič nezmaže**.
- Keď sa hlavný obrázok explicitne zmení bez nového orezania, zruší zastarané SQL výrezy; pri nezmenenom obrázku ich ponechá.
- Každý SQL `DELETE` aj `INSERT` má kontrolu rovnakého `updated_at` **a** `updated_by` ako práve potvrdený kanonický profilový INSERT/UPDATE. Neúspešný/stale profilový zápis teda nemení ani sidecar. Zachováva multizdrojovú konkurenciu a partner/Notion zámky pôvodného kanonického zapisovača.
- Žiadna nová migrácia; tabuľky vznikli v kroku 2.
- Nevykonáva produkčný backfill, `DROP`, `DELETE` JSON, ani automatický posun do `VERIFIED` či `SQL_ONLY`.

## Dôležité hranice
Toto nie je univerzálny cutover. Partneri a niektoré špecializované API zápisy stále môžu používať samostatné kanonické cesty. Ostatné redakčné polia (vstup Notion, zmeny SEO/faktov) majú vlastné existujúce SQL zrkadlá. Výsledok ešte nesmie byť automaticky publikovaný ako úplná SQL-only autorita. Pred prepnutím verejného webu treba preveriť všetkých aktívnych writerov, výstup webu/Notion/partner a per-field revízie.

## Testy
`node --experimental-strip-types --test tests/directory-sql-step3-live-mirror.test.mjs`

Testuje skutočnú SQLite databázu s presnou izolovanou schémou: poradie, slovenské multiradkové texty, explicitné zmazanie, no-op pri vynechaní poľa, CAS revíziu aj aktéra, dve identity (id a kategória+slug), nulový zásah do iného profilu a integráciu troch D1 batch ciest.
