# Chovateľské kluby – jednotné SQL vzťahy (owner-gated)

## Cieľový model
- Plemená: `managed_breeds`, jednotné ID `managed_breeds.id`.
- Stanica ↔ plemená, klub ↔ plemená: **existujúca** `breed_directory_relations`.
- Stanica ↔ klub: **jedna** `directory_breeder_club_relations(station_profile_id,club_profile_id)`.
- Tréner: **žiadne** väzby na plemená ani chovateľské kluby; vlastné služby a kategóriové polia zostávajú nedotknuté.
- Notion: `Prepojené plemená` sa číta pre klub aj stanicu; `Prepojené kluby` výlučne pre stanicu. Synchronizujú sa existujúce jednoznačné názvy, nie ľubovoľný text.

## Prečo PR zostáva Draft
Aplikácia číta novú tabuľku pri detailoch staníc/klubov a v editore. **Zlúčenie pred manuálnou migráciou 0169 by spôsobilo HTTP 500**. Toto PR nič samo neaplikuje v produkčnej D1 ani Notione.

## Kontrolovaný prechod (v tomto poradí)
1. Záloha produkčnej `psipedia-sk-db`, potvrdiť, že je obnoviteľná.
2. V D1 Console spustiť iba `scripts/d1-breeder-club-links-preflight.sql`; zaznamenať čísla. Ak `invalid_json`, `invalid_club_array`, `bad_ids` alebo `invalid_club_targets` nie je 0, STOP.
3. Vyhradiť krátke okno bez súbežných úprav vzťahov staníc/klubov (Admin/Notion). Notion sa inak nezastavuje.
4. **Najprv overiť produkčnú migračnú históriu** cez chránený read-only audit. Migrácia 0169 nadväzuje na 0168, pričom 0158–0168 sú v repozitári označené ako `UNACTIVATED`. Ak ľubovoľný predchodca nie je aplikovaný alebo históriu nemožno overiť, **STOP**: neaplikovať 0169 ručne, neobchádzať ledger ani nenasadzovať aplikáciu. Vyžiadať schválený sekvenčný rollout migračného backlogu.
5. Iba pri overenej úplnej histórii a cez owner-autorizovaný chránený proces aplikovať presne `drizzle/0169_directory_breeder_club_relations.sql`. Zápis je ADDITIVE, neobsahuje backfill ani mazanie.
6. Manuálne spustiť `scripts/d1-breeder-club-links-backfill.sql`. Backfill sa vykonáva iba pred nasadením novej verzie, nikdy po ňom.
7. Spustiť `scripts/d1-breeder-club-links-postflight.sql`: `legacy_pairs_missing=0`, `invalid_new_links=0`. Overiť reprezentatívne klub/stanica ID v oboch smeroch.
8. V PR spustiť CI testy vrátane Playwright, Notion regresií a parity. Až potom povoliť Merge/deploy a preveriť Admin ↔ D1 ↔ verejný web.
9. Neskôr vykonať samostatný read-only audit historických `source_data_json` hodnôt a už nepoužívaných trainer ID. Cleanup iba po schválení a s preukázanou nulovou aktívnou závislosťou.
10. V Notione musí pre klub existovať `Prepojené plemená`, pre stanicu `Prepojené plemená` a `Prepojené kluby`; chýbajúce polia treba vytvoriť/overiť. Bez týchto polí môže byť D1 prepojenie funkčné, ale Notion mirror nevykoná zápis.

## Rozsah
Tento PR nemení tabuľku plemien, FCI identity, kanonické URL, články, adopcie ani databázový model Services V3. Nepremieňa automaticky voľný text na ID. Na verejnom detaile klubu sa zobrazia klikateľné plemená a prepojené stanice; na detaile stanice klikateľné plemená a kluby. Trainer prepojenia sa už neponúkajú.

## Význam existujúcich väzieb
`breed_directory_relations` už používal editor plemien na väzby ku klubom; nová aplikácia iba doplní správu v editore klubu. Primárne členstvo v klube je jednostranný záznam, ktorý sa na klubovom profile číta v opačnom smere.
