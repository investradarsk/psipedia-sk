# Adresár: JEDNORAZOVÝ presun Notion → kanonické SQL (bez zdroja starého JSON)

## Rozhodnutie vlastníka – 20. 11. 2026
Nepokúšať sa obnovovať historický obsah z `source_data_json`, `qualifications_json` ani `seo_json`. Obsahový zdroj jednorazového presunu je **živá Notion databáza Adresár**, data source `84e0664c-ca47-405f-9d54-31b20287bc8c`. Notion **nemeníme**. Už existujúce vzťahy na SQL/Services V3 a R2 médiá zachovávame.

Posledný Notion CONNECTOR počet: **1 850 záznamov**, z toho **1 844** s platným unikátnym `Psipedia ID` a **6 bez ID**. Posledný produkčný D1 read-only audit: **1 847 existujúcich profilov**, stabilné agregáty. Údaje sú z dvoch odlišných okamihov; ich rozdiel nesmie spustiť automatické vytváranie ani mazanie.

## Jeden manuálny workflow – dva režimy
`.github/workflows/production-directory-onetime-notion-import.yml`

### 1. Audit
`Actions → Directory – one-time Notion to D1 (owner only) → Run workflow`, vetva `main`.
- `mode=audit`
- `confirmation=AUDIT-NOTION-DIRECTORY-ONE-TIME-psipedia-sk-db`

Vykoná iba:
- Notion `GET /data_sources`, `POST /data_sources/:id/query` (**query je iba čítanie**);
- D1 `SELECT`, bez `INSERT/UPDATE/DELETE`;
- porovnanie mapovania `Psipedia ID` + `directory_notion_sync.notion_page_id`, kategórie a ochrán;
- sanitizovaný `report.json`: počty, typy nálezov, najviac 12 interných ID na príčinu, nikdy súkromné hodnoty.

### 2. Apply
Po kontrole auditného reportu nový, osobitne potvrdený manuálny beh:
- `mode=apply`
- `confirmation=APPLY-NOTION-DIRECTORY-ONE-TIME-psipedia-sk-db`

Workflow v chránenom prostredí `production`:
1. Overí `main`, presný repo, Cloudflare účet, D1 databázu, Notion data source, Notion API schému a jeden Notion profil na jedno Psipedia ID.
2. Získa **D1 Time Travel bookmark pred prvým zápisom**. Bookmark nie je samostatná exportovaná záloha; prípadné restore je nové rozhodnutie.
3. Pri **každom** profile pred zápisom znovu načíta Notion stránku; ak sa jej revízia zmenila, profil preskočí. D1 používa `updated_at` CAS a viazané mapovanie.
4. Preskočí archivované, odkontrolované, čakajúce na odomknutie, partnersky spravované a nesprávne namapované profily. Potvrdená Google Place adresa nepreberá Notion text.
5. Overí úspešný D1 zápis a na konci nezmenené ID/počty D1 profilov. Pri chybe skončí s označením čiastočného priebehu; dáta sa nesmú slepo prepisovať ani resetovať.

### Obsahové SQL polia
- `directory_profiles`: názov, perex, popis, lokalita bez potvrdeného Google Place, cena, hlavný obrázok URL a **voľné textové** kontakty.
- `directory_profile_qualifications`: riadky kvalifikácií podľa poradia.
- `directory_profile_opening_hours`: pôvodný voľný text do dňa 0 (riadky dní 1–7 sa nemažú).
- `directory_profile_seo`: SEO title/popisy/kľúčové slovo/OG/canonical/noindex; nevyplnené texty neprepíšu existujúci SQL údaj.
- `directory_profile_public_facts` a `directory_profile_filter_values`: výslovne známe Notion polia podľa existujúceho category registry.
- `directory_profile_additional_categories`: priamo z Notion `Ďalšie kategórie`, vrátane explicitného prázdneho zoznamu; dočasne uloží **iba technický príznak SQL potvrdenia** do `source_data_json`, lebo aktuálny verejný reader inak nerozozná SQL `[]` od starého fallbacku.
- `directory_profile_quality_resolutions`: iba platné uvedené hodnoty s časom kontroly.

### Čo import nesmie vymyslieť ani poškodiť
- **Prázdna alebo chýbajúca Notion hodnota** nie je dôkaz úmyselného vymazania: v SQL sa ponechá doterajšia hodnota. Nie je to automatický konflikt. Na vymazanie treba samostatný overený úkon.
- Neimportuje sa publikovanie, zmena slug/primárnej kategórie, review lock, Google Place ID, geo súradnice ani partner ownership.
- `Služby z katalógu` je Notion relácia a **Services V3 je už samostatná kanonická SQL relácia**. Import sa nesmie tváriť, že starý text `Služby` znamená vybrané V3 `yes/no`; existujúce voľby sa zachovajú bez zmeny.
- V Notion Adresári **nie je samostatné pole galérie**, preto import nevymýšľa ani nemaže R2/SQL galérie.
- Šesť Notion stránok bez `Psipedia ID` sa bez kontroly identity nepridáva ako nové profily.
- Zdrojové JSON údaje sa **nečítajú ako obsah**, ale existujúci starý JSON zostáva na D1 ako historické dáta do záverečného `SQL-only` read cutoveru. Výnimkou je kontrola starého bezpečnostného zámku a dočasný SQL-checked flag vedľajších kategórií.
- Jeden zelený import **neznamená**, že verejný web/Admin/Notion už čítajú všetko z SQL. Konečné vypnutie JSON readerov a PR #1448 iba po **paritnom postflight**.

## Prevádzkové upozornenie
Účet používa automatizácie na priebežné dopĺňanie Notionu. Naplánovaný beh môže byť pri časti profilov súbežný; CAS/revízne kontroly ich preto **preskočia**, nie prepíšu. Po apply sa vyhodnotia preskočenia a dokončí read cutover bez straty SQL údajov. Jednorazový import sa nesmie nasadiť ako denný alebo hodinový scheduler.
