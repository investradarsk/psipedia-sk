# Psipedia.sk – jeden zdroj údajov: fáza 3/4

Dátum: 15. 11. 2026. **Ochrana existujúcich profilov pred historickým importom.**

## Prečo treba túto opravu

Starý generický import `/admin/import` nebol nepretržitý proces:
spúšťal sa iba po výbere JSON súboru a explicitnom potvrdení.
Pri opakovanom importe však SQL `ON CONFLICT DO UPDATE` dovolilo
prepísať **existujúce koncepty** – ich popis, služby, lokalitu, kontakty
aj `source_data_json`. Publikované profily už mali ochranu, ale
koncepty sú tiež legitímne ručne editované záznamy.

Pravidlo: **od prvého vytvorenia profilu je autoritou jeho editor/D1,
nie pôvodný importný súbor**. Nové profily možno vytvoriť, existujúce
sa už nikdy nesmú aktualizovať generickým importom.

## Čo tento PR mení

- **Preview:** každý existujúci profil v ľubovoľnom stave
  (`draft`, `published`, `archived`, prípadne ďalšie stavy)
  sa označí `skipped`. Vstupné staré údaje sa preň nemergujú.
- **Commit:** `INSERT INTO directory_profiles ... ON CONFLICT DO NOTHING`.
  Platí pre kolíziu `import_key` aj unikátne `category+slug`.
  Neexistuje `DO UPDATE` vetva pre profil.
- **Race condition:** profil, ktorý niekto vytvorí medzi Preview a
  potvrdením, bude v `INSERT` preskočený; počet ovplyvnených riadkov
  nebude 1 a požiadavka vráti konflikt, nie falošný úspech.
- **Výsledok:** počty importovaných profilov označujú len nové vloženia,
  nie preskočené profily. Geo/resource reconciliation sa vykonáva iba
  pre skutočne vytvárané profily.
- Bez zmeny správania generického importu článkov, podujatí, pomoci a
  právnych nastavení. Bez D1 migrácií, nových cronov či Notion schema zmien.

## Audit ostatných zapisovačov (stav kódu)

| Cesta | Správanie | Rozhodnutie |
| --- | --- | --- |
| Generický JSON import | Doteraz vedel aktualizovať koncept | **Tento PR: iba nové profily** |
| Notion → D1 pre 10 kategórií | Cielené editované property ID, per-field zápis a CAS | Nechať funkčné; legitímne redakčné zmeny v Notione neblokovať |
| Kvalita údajov | Objavenie len vytvára návrhy; manuálne prijatie načíta aktuálne D1 a kontroluje prázdne pole + `updated_at` | Zachovať |
| Automation update findings | Návrhy podliehajú per-field revízii; pri prijatí sa porovná predchádzajúca a aktuálna hodnota a `updated_at` | Zachovať |
| Canonical apply review | Explicitné `APPLY_INCOMING` s reviewerom a očakávanou revíziou | Zachovať |
| Legacy automation apply | Pre existujúce canonical záznamy je zakázané automatické UPDATE | Zachovať |
| Partner editácie | Oddelené návrhy a schvaľovanie | Zachovať |
| Admin editor | Ukladá do D1 a cez per-field sync do Notion | Zachovať |

**Dôležitá otvorená otázka:** Notion automatizácia, ktorá prepíše
hodnotu priamo v Notione, môže vytvoriť legitímne vyzerajúcu
`page.properties_updated` udalosť. Bez spoľahlivej identifikácie
autora alebo per-field pôvodu nemožno garantovať, že každá zmena
v Notione je človekom schválená. Tento PR nemení povolené obojsmerné
Notion úpravy, preto ich neoznačuje za dokonale ochránené.

## Regresné testy

- SQLite: nový profil sa vloží.
- SQLite: ručne upravený koncept zostane **bitovo rovnaký** po
  opakovanom importe so starým popisom, webom, službami aj JSON.
- SQLite: kolízia `import_key` aj `category+slug` nemení identitu.
- SQLite: publikovaný profil je rovnako chránený.
- Policy test: Preview preskakuje všetky stavy, no ostatné domény
  môžu stále vykonávať pôvodný explicitný update.

## Stav a hranice

Zmena je iba v samostatnej branchi / Draft PR. Nevykonal sa produkčný
D1 zápis, migrácia ani merge. Fázy 1/4 (#1379) a 2/4 (#1380) sú
samostatné rozpracované PR. Fáza 4/4 má odstrániť čítacie fallbacky
a historické zdrojové aliasy až po preflight parite a schválenej migrácii.
