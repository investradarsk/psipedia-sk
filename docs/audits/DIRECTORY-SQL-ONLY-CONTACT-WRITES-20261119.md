# Adresár – SQL jediný zdroj verejných kontaktných hodnôt (1. krok čistenia)

Dátum: 19. 11. 2026.

## Cieľ
Verejné a upraviteľné údaje jedného profilu sa majú ukladať v kanonických SQL stĺpcoch. Notion slúži ako obojsmerný editor, nie druhá D1 databáza. Staré `source_data_json` aliasy nesmú znovu vytvárať vymazané hodnoty.

## Táto úprava
- Existujúce SQL polia `directory_profiles.name`, `excerpt`, `description`, `region`, `district`, `city`, `address`, `postal_code`, `street`, `house_number`, `website_url` zostávajú bez zmeny schémy.
- Pri **explicitnej** úprave kontaktu z Adminu: celá uložená hodnota ide do SQL (`public_phone`, `public_email`, `facebook_url`, `instagram_url`, `website_url`) a iba aliasy tohto poľa sa odstránia z trvalého `source_data_json` v tom istom zápise. V pamäti editor stále používa svoj existujúci read model.
- Pri podpísanom per-field Notion evente platí rovnaké pravidlo: zmení sa len relevantný SQL stĺpec a z JSON sa odstránia vlastné historické aliasy. Zmena Facebooku sa nedotkne telefónu ani iného kontaktu.
- `NULL` a neexistujúci záznam sa stále považuje za historicky **nemigrované** údaje; takýto kontakt sa bez explicitnej aktualizácie neodstráni. SQL `''` je potvrdené vymazanie, ktoré nikdy nesmie čítať starý alias.
- Povolené sú ľubovoľné surové texty vrátane neštandardných URL, telefónov a e-mailov.
- Žiadna D1 migrácia ani hromadný UPDATE/DELETE. Existujúci `Odkontrolované` a Notion sync sa nemenia.

## Čo ešte NIE JE hotové
Plný cutover všetkých desiatich kategórií a odstránenie historických JSON polí je samostatná fáza po read-only inventári a paritnom reporte. Pred ich zmazaním musí byť pre každý profil preukázané:
1. všetky kontakty, kategórie, redakčné fakty a filtre sú vyplnené alebo vedome vymazané v SQL;
2. na ich JSON aliasoch nezávisia verejné filtre, listingy, detail, Admin, Notion ani automatizácie;
3. pri rizikových rozdieloch existuje ručné rozhodnutie a obnovenie zo zálohy;
4. fungujú per-field save, explicitné clear a Notion webhooky v každej kategórii.

**Nemažte `source_data_json` ako celok.** Obsahuje aj aktuálne interné kontrolné, galériové a vzťahové metadáta. Po overení je možné selektívne odstrániť iba zastarané aliasy.
