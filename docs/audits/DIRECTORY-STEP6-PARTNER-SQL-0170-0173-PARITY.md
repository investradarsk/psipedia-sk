# Adresár – krok 6/8: partnerské zápisy do rovnakých kanonických SQL relácií

## Výsledok tejto úpravy
Obe už existujúce vetvy na správu profilu – **priame úpravy schváleného partnera** v `lib/partner-direct-profile.ts` aj **schvaľovanie zmenových návrhov v Admine** v `lib/partner-profile-changes-admin.ts` – používajú `buildDirectoryApplyStatement` ako kanonický profilový zápis. Tento PR dopĺňa chýbajúce 0170/0173 relačné SQL projekcie.

| Partnerské pole | Ukladanie do SQL |
| --- | --- |
| Otváracie/ordinačné hodiny | 0170 `directory_profile_public_facts` (doterajší zobrazený fakt) + 0173 `directory_profile_opening_hours` deň 0 bez straty voľného textu |
| Fotogaléria (max. 6) | 0173 `directory_profile_media` s pôvodným poradím |
| Ďalšie kategórie | 0170 `directory_profile_additional_categories`; `_psipedia_additional_categories_sql_confirmed = '1'` je zrkadlený aj pri explicitnom `[]` |
| Kategóriové filtre | 0170 `directory_profile_filter_values`, výhradne platné registrované ID a hodnoty |

## Presná transakcia
Kanonický `UPDATE directory_profiles` sa vykoná ako prvý a musí zasiahnuť **presne jeden** riadok. Bezprostredne za ním nasleduje **jeden** `changes() = 1` SQL guard; ak neprešiel, celá `D1.batch` alebo schvaľovacia moderation transakcia sa vráti späť.

Každý zrkadlový zápis je obmedzený presným ID profilu, jeho novým `updated_at`, kategóriou/aktérom podľa príslušného planera. Nie je možné zapisovať vedľajšie dáta pri neúspešnom hlavnom zápise.

**Neprítomná položka nie je zmazanie.** Partner môže zmazať konkrétnu galériu (`[]`), hodiny (`""`), kategórie (`[]`) alebo jeden filter. Nedotknuté údaje a iné profily ostávajú.

## Zachované hranice
- Existujúce D1 tabuľky 0170, 0173 a Services V3. **Žiadna nová migrácia**.
- Notion review lock (`Odkontrolované`) a aktuálne schvaľovanie partnerov sa nemení.
- Verejné kontakty sú text bez URL/e-mail formátovej validácie a zapisujú sa iba pri explicitnom edite do SQL stĺpcov; staré aliasy sa nevracajú.
- Potvrdené Google Place údaje sa nesmú prepísať iba prítomnosťou neúplnej partnerskej adresy.
- **Services V3** sú naďalej separátne kanonické `service_profile_option_choices` a nesmú sa inferovať z legacy `services_json` alebo z voľného textu.
- Doterajšie JSON metadáta sa zatiaľ ponechávajú pre čítacie cesty, ktoré neboli prepnuté. Tento PR nie je povolenie na #1448 cleanup.

## Dôkaz / ďalšia práca v kroku 6
Regresné testy overujú kombinované 0170+0173 zápisy, explicitné clear, vynechané polia, staré revízie a nezávislosť profilov. Ďalšia fáza musí pred SQL-only čítaním ešte zjednotiť konflikt pri súčasnom Admin/Notion edite *toho istého poľa*, presný poriadok zmien a spracovanie historicky nemigrovaných záznamov. Aktuálny bezpečný CAS konflikt sa nesmie vydávať za automatické per-field last-write-wins.

**Produkčný 0170/V3 inventár** je už súčasťou zlúčeného PR #1466 a čaká na ručné spustenie existujúceho GitHub Actions workflow; inventár nespúšťa žiadny D1 zápis.
