# Psipedia.sk – jeden zdroj údajov, fáza 2/4

15. 11. 2026. Téma: **rovnaké redakčné údaje vo verejnom profile a v Admin editore Adresára**.

## Zámer

Historické polia `source_data_json` sa stále používali ako verejný zdroj,
hoci v editore niektoré vôbec nebolo možné opraviť. Žiadna verejná hodnota
už nesmie byť závislá od názvu poľa, ktorý editor vôbec nepozná.

## Zmena

- `lib/directory-public-facts.ts`: jeden spoločný register kategóriových
  verejných faktov pre Admin aj public; bez inferencie z `description`.
- V Admine, v sekcii **Obsah profilu**, je kompaktná rozbaľovacia časť
  **Ďalšie verejné informácie**. Ponúka presné polia, ktoré sa používajú
  na verejnej stránke danej kategórie. Existujúce `Organizácia`,
  `Zameranie` a `Ordinačné hodiny` sa neduplikujú.
- Pri načítaní editor a public používajú rovnaký read kontrakt.
  Historické synonymá sa použijú iba ak chýba hlavný kľúč; explicitne
  prázdny hlavný kľúč **už nikdy neobnoví historický alias**.
- `PUT /api/admin/directory/[id]`: prijíma len staticky povolené
  verejné textové fakty; ostatné odignoruje. Existujúci per-field D1 CAS
  writer zapisuje **len zmenené polia** a nemení Services V3, GEO,
  kontakty ani vzťahové tabuľky.
- Admin odosiela pôvodné hodnoty editovaných faktov; rozdiel oproti
  najnovšiemu D1 stavu vyvolá HTTP 409, nie tiché prepísanie.
- Pôvodných šesť pilotných Notion vlastností zostáva obojsmerne
  synchronizovaných existujúcou cestou. Ďalšie verejné fakty sú zatiaľ
  **Admin/D1-owned**: neodosielajú sa do neexistujúcich Notion vlastností.

## Súčasné hranice

Táto fáza nie je odstránenie `source_data_json` – ten dnes stále obsahuje
použiteľné aj pomocné údaje a bez čítacieho produkčného auditu ich nemožno
bezpečne preklopiť. Cieľom 2/4 je **viditeľnosť/editovateľnosť** aktuálnych
verejných faktov a bezpečné explicitné prepisy.

Vzťahy k plemenám a klubom, katalóg Služby V3 a dynamické Google Place
majú vlastné D1 tabuľky a editorové bloky; nie sú odvodené z týchto
textových polí. Pri zobrazení prepojení môže verejný profil zámerne
uprednostniť vzťah pred starým textovým faktom – úplný audit vzťahovej
autority patrí do ďalšej fázy.

## Kontrolné prípady

1. Veterninár: RTG, USG, laboratórium, pohotovosť, hospitalizácia –
   zobraziteľné aj upraviteľné cez ten istý kľúč.
2. Kynologický klub: typ a športové zameranie, obrany, stopy a ďalšie fakty.
3. Chovateľský klub / stanica: textové plemená a FCI položky viditeľné
   v editore; existujúce väzby ostávajú nedotknuté.
4. Venčenie / hotely / ďalšie služby: kategóriové textové fakty sa
   neprepájajú a neprepisujú katalógové služby.
5. Vymazať `Organizácia`, `Ordinačné hodiny` alebo `Pokrytie`:
   historický alias nesmie informáciu oživiť.
6. Zmeniť jedno pole v Notione počas otvoreného Admin editora:
   následný starý zápis do toho istého poľa musí dostať 409.
7. Bez produkčného D1 zápisu, bez schema migration, bez zmeny verejnej
   URL, publikovania, SEO a automatizácií.

## Stav validácie

PR obsahuje regresné testy; bez prebehnutia CI, prehliadky vizuálnych
screenshotov Adminu a ručného produkčného overenia neznačiť ako hotový
nasadený cutover. Fáza 1/4 (#1379) je samostatný otvorený Draft PR; tento
PR z nej nekopíruje súbory a musí sa pred merge skontrolovať prípadná
kolízia v `lib/notion-directory-sync.ts`.
