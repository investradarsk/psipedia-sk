# Adresár 0170 — postupná osobná kontrola a SQL kontakty

Cieľ: majiteľ postupne prejde existujúcich ~1 845 profilov cez Admin.
**Neimportovať hromadne neoverené údaje z Notion ani zo starých JSON aliasov.**
Táto fáza neobnovuje zmazané ID ani nevytvára nové profily.

## Aktívna zmena po merge/deploy PR #1428

- 4 kontakty majú SQL stĺpce `public_phone`, `public_email`,
  `facebook_url`, `instagram_url`. Pri Admin uložení sú zapísané
  **v tom istom SQL UPDATE** ako ostatné polia a kompatibilný JSON;
  partial payload bez poľa starú SQL hodnotu nemení.
- SQL `NULL` = kontakt ešte nepotvrdený pre SQL, takže sa číta pôvodný
  JSON alias. SQL `''` = explicitne prázdne, nikdy sa neobnoví starý alias.
- Notion field-event zápis kontaktu mení presne jeden SQL kontakt a príslušné
  historické aliasy v jednej D1 operácii (len ak profil nie je odkontrolovaný).
- Keď vlastník **vedome označí Odkontrolované v Admin**, prevezmú sa iba
  doteraz `NULL` SQL kontakty z práve zobrazovaných hodnôt. Už uložené SQL
  hodnoty vrátane prázdnych sa neprepisujú. Operácia používa
  source_data_json + updated_at CAS; revízia sa zvýši a súbežný starý save
  nedostane právo prepísať potvrdenie.
- Odkontrolované profily sú v Notion Directory synchronizátore preskočené
  pre bežné obsahové a katalógové zápisy **v oboch smeroch**. Izolované
  zrkadlenie samotného zaškrtnutia do Notionu zostáva; Notion nedokáže
  odškrtnúť už potvrdený Admin profil. Vedome odomknúť vie vlastník v Admin.

## Nepokrýva táto fáza

- Nie je to SQL cutover **sekundárnych kategórií, verejných faktov a 21 filtrov**.
  Tie stále číta a zapisuje historická cesta a potrebujú samostatný koordinovaný
  prechod so skúškou zobrazovania dvoch kategórií.
- Neruší sa `source_data_json`; stále obsahuje galérie a interné metadáta.
- Neprepíše sa žiadne existujúce produkčné ID, URL, väzba `directory_notion_sync`,
  podujatie ani pomoc psom. `0170` schéma je už v produkcii.
- Samotný merge nie je dôkaz deployu alebo testu živých Admin↔D1↔Notion↔web
  profilov; po merge je potrebné otestovať jeden profil z každej kategórie.
- Ochrana sa týka Directory synchronizátora, nie iných nezávislých
  administrátorských zásahov či vlastníkom povolených editácií v D1.

## Overenie

1. Na neodkontrolovanom profile ulož len Facebook: telefón, e-mail,
   Instagram a ostatné údaje musia ostať.
2. Vymaž jedno pole kontaktu, ulož, obnov stránku; starý alias nesmie
   vrátiť vymazanú hodnotu ani na verejnej stránke.
3. Označ `Odkontrolované`. V D1 musí byť od tohto kroku nenulová
   hodnota (aj `''`) pre každý zo 4 kontaktov; nový Notion obsah nesmie
   meniť potvrdený profil.
4. V Admin odškrtni a over, že korekcie môžu opäť fungovať.
5. Žiadne opätovné spustenie `0170` alebo všeobecné
   `wrangler d1 migrations apply`: databázová schéma bola nasadená
   samostatným chráneným postupom.
