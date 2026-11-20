# Adresár 0173 – SQL-first čítanie profilu po importe z Notionu (20. 11. 2026)

## Konkrétny problém
Jednorazový produkčný import Notion → D1 úspešne zapísal **1 829 / 1 829** vhodných profilov (GitHub Actions [#44701314783](https://github.com/investradarsk/psipedia-sk/actions/runs/44701314783)). SQL `directory_profile_qualifications`, `directory_profile_seo` a `directory_profile_opening_hours` už obsahujú editorial hodnoty, ale `rowToPublicProfile` / `rowToManagedProfile` ich čítali z kompatibilných `qualifications_json` / `seo_json` / `source_data_json`. Po importe sa preto mohli zobrazovať staré hodnoty, hoci D1 má nové.

## Tento PR – prvé reálne prepnutie čítania
- Jediný indexovaný SELECT projektuje SQL kvalifikácie (poradie zachované), SEO vrátane `noindex`, výnimočné hodiny (deň 0), quality resolutions a SQL media.
- Verejný detail používa SQL kvalifikácie / SEO / hodiny pred publikovaním odpovede a tvorbou metadát / JSON-LD. Existujúci 0170 SQL overlay faktov zostáva v činnosti.
- Admin `getManagedDirectoryProfileById` a `getManagedDirectoryProfileByCategorySlug` vracajú SQL kvalifikácie / SEO / hodiny a SQL kvalitu skôr, než editor dostane hodnoty. Znižuje sa riziko zobrazenia zastaraného obsahu alebo jeho prepísania plným uložením.
- SQL kvalifikácie sa použijú len pri existujúcich riadkoch. Nulový počet riadkov zatiaľ nemení historický profil na explicitne prázdny: chýba garantovaný per-field marker kompletného presunu, a vymazanie obsahu odhadom je neprípustné.
- SQL SEO sa použije pri existujúcom riadku vrátane `noindex=0` (nenahrádza sa falošnou hodnotou z JSON).
- SQL otvorené hodiny (deň 0) majú prednosť pred starým voľným textom; číselné dni 1–7 sa nemažú ani neodvodzujú.
- SQL quality resolution sa v Admin modeli premietne po poliach, bez toho, aby sa starý JSON prepisoval na čítaní.
- Existujúca galéria z R2 zostane nedotknutá, najmä ak SQL media má iba `image_key`. SQL galéria sa použije až keď sú všetky potrebné priame URL dostupné.
- Výpadok doplnkového SQL detail read na verejnom webe nespôsobí HTTP 500 (kontrolovaný fail-open), v Admin čítaní je chyba fail-closed (neotvára zastaraný formulár).
- Žiadny zápis Notion/D1, žiadna nová migrácia, žiadny import z historických JSON hodnôt.

## Čo tento PR NEROBÍ
Neodstraňuje pôvodné JSON stĺpce a ešte neprepína úplne všetky zoznamové/read vetvy ani Notion export na SQL. To vyžaduje samostatný kompletný audit paritných polí (najmä **prázdne** hodnoty, Services V3, galérie a read-only publikáciu) a vyhradený SQL-only writer. Nie je bezpečné zlúčiť PR #1448 s čistením JSON, kým zvyšné čítania a synchronizácia neskončia.

## Kontrola
`node --experimental-strip-types --test tests/directory-0173-editorial-sql-read.test.mjs`: izolované SQLite overenie poradia kvalifikácií, zhodného profilu ID, noindex true/false, hodín, quality, galérií R2 key-only a chybových výsledkov. PR workflow nespúšťa žiadnu produkčnú migráciu ani Notion aktualizáciu.
