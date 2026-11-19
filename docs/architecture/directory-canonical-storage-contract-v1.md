# Psipedia.sk — dátová architektúra Adresára (V1)

19. november 2026. Rozsah: Adresár vo všetkých kategóriách, Notion, Admin, partner, D1 a verejný web. Toto je **cieľový kontrakt**, nie vykonaná produkčná migrácia.

## Základné rozhodnutie

Cloudflare D1 je SQLite SQL databáza. Dnešné source_data_json, seo_json, qualifications_json a podobné názvy sú **SQL stĺpce typu TEXT, ktoré obsahujú serializovaný JSON**. Nie je to samostatná databáza. JSON je prípustný ako technický formát, ale **nesmie byť druhým zdrojom rovnakého verejného alebo editovateľného údaja**.

Pravidlo: **každé verejné a po jednom upravované pole má presne jedného SQL vlastníka**. Použiť bežný SQL stĺpec pre jednu hodnotu, relačnú SQL tabuľku pre opakované/prehľadávané dáta. JSON v D1 používať len pre malú nevyhľadávanú technickú konfiguráciu, ktorá nie je po jednotlivých poliach synchronizovaná s Notion.

Používateľ súhlasí so stratou historických hodnôt a neskorším ručným doplnením. Identita profilov, Notion mapping, zámky, Admin, partner účet a verejné funkcie sa však nesmú pokaziť.

## 1. Jednoznačné SQL vlastníctvo

| Údaj | Cieľová SQL tabuľka alebo stĺpce | Stav a osud starého JSON |
| --- | --- | --- |
| Identita, slug, názov, hlavná kategória, publikovanie, perex, popis | directory_profiles: existujúce priame SQL stĺpce | Zachovať SQL; odstrániť importné kópie |
| Kraj, okres, mesto, ulica, číslo, PSČ, adresa, formát, potvrdenie lokality | directory_profiles: existujúce SQL stĺpce | Vypnúť historické čítanie Okres z JSON; odstrániť záložné hodnoty |
| Telefón, e-mail, web, Facebook, Instagram, interný kontakt | directory_profiles: public_phone, public_email, website_url, facebook_url, instagram_url, internal_email | Neuchovávať staré kontaktné aliasy v source_data_json |
| Cena/poznámka, statusy verified/featured, dátumy, redakčné stavy | directory_profiles: existujúce SQL stĺpce | Bez JSON duplikátov |
| Druhá a ďalšie kategórie profilu | directory_profile_additional_categories | Tabuľka existuje; po runtime cutoveri odstrániť _psipedia_additional_categories a jeho marker |
| Filtrované kategóriové atribúty | directory_profile_filter_values alebo jedno vlastnícke pole Services V3 podľa významu | Existujúci SQL model; prepnúť runtime; odstrániť _psipedia_filter_v1_* |
| Doplnkové verejné fakty podľa kategórie (špecializácie, pokrytie, vrhy, chovateľ a pod.) | directory_profile_public_facts: profile_id, field_key, value_text | Existuje SQL tabuľka; verejné/editorské čítanie a Notion zápis ešte treba úplne prepnúť |
| Služby typu áno/nie | Services V3: service_profile_option_choices a katalóg | Už existuje SQL model; služby nesmú byť paralelne v services_json |
| Iné vlastnosti služieb | Jednoznačné typované SQL vlastníctvo v Services V3 | Staré service_profile_property_values.value_json je prípravný model, nie automatické schválenie každého verejného údaja ako JSON |
| Voľný text o službe, ak nie je službou Services V3 | Jeden explicitný textový SQL údaj alebo directory_profile_public_facts podľa významu | Zrušiť _psipedia_trainer_services_text a nevytvárať ďalšie pole Služby s iným významom |
| Kvalifikácie a certifikáty (opakované položky) | Nová directory_profile_qualifications: profile_id, poradie, text | Nahradiť qualifications_json |
| Plemená a väzby na kluby/organizácie | Existujúce SQL väzby, napr. breed_directory_relations; chýbajúce relačné väzby doplniť, nie kopírovať | Odstrániť paralelné JSON zoznamy a textové identifikátory po runtime cutoveri |
| Ordinačné a otváracie hodiny | Nová directory_profile_opening_hours: profil, deň, interval, čas od/do a voliteľná poznámka | Staré textové JSON hodiny vyradiť po prepnutí |
| Hlavný obrázok | directory_profiles.image_url a image_key, binárny súbor v R2 | Nedržať ďalšiu verejnú URL v source_data_json |
| Galéria, poradie a alt texty | Nová directory_profile_media: profile_id, image_key alebo URL, poradie, alt, pôvod | Nahradiť _psipedia_breeder_gallery_urls |
| SEO title, description, canonical, focus keyword, OG a noindex | Nová directory_profile_seo: jeden riadok na profil, jednotlivé SQL stĺpce | Nahradiť seo_json; dôležité pre per-field Notion synchronizáciu |
| Odkontrolované, dátum/kto, pending unlock | SQL review state (samostatné stĺpce alebo directory_profile_review_state) | Nahradiť _psipedia_profile_review_* bez straty zámku Notion sync |
| Kontrola kvality a jej dátumy/statusy | SQL quality resolutions (využiť existujúci vhodný model alebo doplniť riadky) | Nahradiť _psipedia_quality_* |
| Notion mapovanie a per-field stav synchronizácie | directory_notion_sync a existujúci SQL event/change model | Nepridávať konkurenčný sync stav do zdrojového JSON |

**Kolidujúce názvy polí** musia mať jedného vlastníka. Napríklad Pohotovosť ako filter a Pohotovosť ako verejný text nie sú automaticky dva nezávislé údaje. Podobne Services V3 nie sú to isté ako nezaradené voľné poznámky o službe. Zápis Notion -> SQL musí rešpektovať skutočný význam poľa.

Nepredpokladať, že každý navrhnutý názov tabuľky je nový: pred CREATE overiť aktuálne SQL migrácie a existujúce relačné úložiská. Uvedená tabuľka zachytáva cieľ, nie potvrdené nasadenie.

## 2. JSON, ktorý môže zostať v D1

| Existujúci stĺpec | Cieľ |
| --- | --- |
| thumbnail_display_json | **PONECHAŤ** ako malý technický objekt orezania/zoomu/ohniska náhľadu; nie alternatívna URL/názov/popisy |
| detail_display_json | **PONECHAŤ** ako samostatný technický objekt orezania/zoomu hlavného obrázka |
| seo_json | **ODSTRÁNIŤ** po SQL cutoveri do directory_profile_seo |
| services_json | **ODSTRÁNIŤ** po Services V3 cutoveri a vyriešení oddeleného voľného textu |
| qualifications_json | **ODSTRÁNIŤ** po cutoveri na kvalifikačné SQL riadky |
| source_data_json | **ÚPLNE ODSTRÁNIŤ** až keď má každý aktívny verejný aj interný kľúč jedno SQL vlastníctvo a kód už stĺpec nečíta ani nezapisuje |

Dva image-display JSON stĺpce nie sú duplicitnými profilovými údajmi: konfigurujú dva rôzne výrezy. Ak sa ich vnútorné nastavenia začnú filtrovať, samostatne editovať cez Notion alebo potrebovať per-field timestampy, presunúť ich do SQL tiež.

## 3. Poradie technickej realizácie

1. Prijať tento kontrakt ako jedinú mapu vlastníctva: Notion property -> D1 table.column alebo SQL relation. Pre všetky kategórie. Neznáme polia sa neposielajú automaticky do source_data_json.
2. Doplniť chýbajúce SQL schémy **aditívne**. Nezmazať zatiaľ databázové objekty, na ktorých závisí runtime.
3. Prepnúť **všetky zápisy**: Admin, partner, Notion inbound, automatizácie, importy. Nesmie sa viac obnovovať JSON ako záložná redakčná autorita.
4. Prepnúť **všetky čítania**: detail, listing, karty, vyhľadávanie, filtre, Admin reload, Notion outbound, automatizácie. Prázdne SQL je platné, žiadny fallback do starého JSON.
5. Jednorazovo **voliteľne** načítať Notion -> SQL, v dávkach a s kontrolou mapovania. Staré hodnoty môžeme zámerne zahodiť. Pri importe chrániť proti súčasným webhook úpravám; zámok Odkontrolované naďalej rešpektovať.
6. Funkčne overiť: jedna úprava Admin -> SQL -> Notion, jedna úprava Notion -> SQL -> web; explicitné vymazanie; dva typy profilu, filtre, Services V3, otváracie hodiny, galérie, SEO, recyklácia cez partner účet.
7. Až potom **DELETE starých kľúčov a DROP nepotrebných JSON stĺpcov**, po dôkaze nulových aktívnych readers/writers a zhotovení obnoviteľnej D1 zálohy/bodu. Kontrolovať integritu profilových ID a vzťahov, nie historickú rovnosť textov.

PR #1448 je čistiaci PR podľa starého poradia. Podľa tejto novej stratégie ho neaktivovať v produkcii pred bodmi 2–6; ponechať Draft alebo jeho cleanup neskôr nahradiť.

## Výsledný architektonický kontrakt

- Jedna verejná hodnota = jeden SQL stĺpec alebo jeden typ SQL relačného riadka.
- Žiadna editoriálna záloha alebo fallback v source_data_json.
- Zdieľané/opakované dáta patria do relačných SQL tabuliek.
- JSON v D1 je dovolený **iba pre technické nastavenia zobrazenia**, nie ako generické úložisko verejných dát.
- Notion a Admin sú editory kanonickej D1 SQL databázy; verejný web číta D1.
- Strata starých importných hodnôt je akceptovaná; strata funkčnosti, zámkov alebo väzieb nie.

Tento návrh nevykonáva produkčné zápisy, migrácie, DROP ani DELETE.
