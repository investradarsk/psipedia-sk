# Psipedia.sk — význam „Odstrániť“ v Admine

Dátum: 2026-11-20. Stav: implementácia zoznamových tlačidiel vo vetve `feat/admin-delete-means-hard-delete`; produkčné E2E neoverené.

## Rozhodnutie majiteľa

**„Odstrániť“ = fyzicky odstrániť kanonický záznam z aktívnej Cloudflare D1** a odstrániť bezpečne priraditeľné súvisiace záznamy a výhradne vlastnené médiá; **„Archivovať“ = záznam uchovať a len zmeniť stav**. Tieto akcie sa nesmú zamieňať. Nesmie vzniknúť možnosť automaticky obnoviť odstránený obsah cez Notion ani import.

## Čo už projekt obsahoval

Existujúci `lib/admin-record-lifecycle.ts` pokrýva 8 hlavných kanonických agend:
`directory`, `events`, `help`, `breeds`, `articles`, `adoptions`, `lost-found`, `organizations`.

Jeho `removeRecord` vykonáva D1 tombstone + skrytie záznamu, overuje presnú identitu napojených Notion stránok, presúva ich do koša Notion, potom pri úspešnom finálnom kroku vykonáva `DELETE FROM` kanonickej tabuľky. Identifikátor, slug a minimálne retenčné údaje v `admin_record_tombstones` zostávajú kvôli bariére proti opätovnému importu. R2 kľúče sa vymažú len pri preukázateľnej exkluzívnej väzbe. Neprebehne automatické vymazanie recenzií, partnerových členstiev, finančných dojednaní alebo auditných dôkazov; pri ich existencii je výsledok `READY_LOCAL`, nie falošné `COMPLETE`.

**Notion API neumožňuje touto cestou garantovať okamžité nezvratné fyzické zmazanie stránky.** `in_trash:true` znamená presun do koša. Cloudflare D1 backup/Time Travel, právne retenčné pravidlá a prípadné externé médiá sú samostatná téma.

## Opravené v tomto PR

- Články, plemená, podujatia a Help prípady: tlačidlo v zozname prestalo volať staré `DELETE /api/admin/{kind}/{id}` (z ktorých niektoré zámerne vracajú 409) a používa overený GET→POST `/api/admin/record-lifecycle/{kind}/{id}`.
- Adresár: samostatné **Archivovať** zostáva zachované; pridané samostatné **Odstrániť** s potvrdením a kanonickým lifecycle.
- Helper pred POST porovná aktuálne D1 ID a názov s tým, čo vlastník potvrdil v zozname. Nepoužíva heuristiku názvu na hľadanie Notion stránky, ani samostatné obchádzajúce SQL DELETE.
- Správy v UI dôsledne rozlišujú `COMPLETE` vs. čakajúcu/slabú verifikáciu.

## Inventár ďalších mazacích povrchov

- Adopcie, stratené/nájdené, organizácie a všetkých 8 hlavných editorov: už používajú `AdminRecordLifecycleActions`, hromadné mazanie `AdminRecordBulkDelete`; pred tvrdením o funkčnej parite treba preveriť reálne kliknutie, Notion a D1 dokončenie v produkcii.
- Dopyty (`directory_inquiries`) a redakčné tipy (`news_tips`) používajú existujúce skutočné `DELETE FROM ... RETURNING`.
- Meniny psov: tlačidlo hovorí **Archivovať** a API mení stav; nezamieňať za odstránenie.
- Facebook obrázky/príspevky: samostatná agenda používa `deleted_at` (soft-delete tombstone), nie fyzické vymazanie D1 riadku. Odstránenie publikovaného Facebook príspevku, Notion stránky a R2 médií nie je týmto PR automatizované a musí byť osobitne navrhnuté a testované.
- Používateľské recenzie, partnerské účty, žiadosti, auditné logy, platobné údaje a cudzie médiá majú zámerne oddelené právne a ochranné obmedzenia; nemožno ich bez ďalšej analýzy „CASCADE“ vymazať len preto, že vlastník odstráni profil.
- Historické `help_cases` útulky vrátane 10 zámerne odstránených profilov: tento PR **nevykonáva** spätné produkčné mazanie ani neoprávnene neobnovuje staré záznamy. Kategórie a ich SQL cutover zostávajú v samostatnom PR #1463.

## Produkčné akceptačné kritériá

1. `npm run test:record-lifecycle`, nové regresie a celkové CI musia byť zelené.
2. Vyskúšať vytvorenie a odstránenie testovacieho nepublikovaného záznamu pre každú hlavnú agendu; po `COMPLETE` fyzická absencia v kanonickej tabuľke, nulový public lookup a neexistencia návratu po Notion sync.
3. Pre napojený Notion: GET/PATCH/GET `in_trash`, overená identita a minimálny tombstone. Pre blokovaného partnera/recenziu: čakajúci stav, skrytý záznam a viditeľná chyba bez tvrdenia `COMPLETE`.
4. Kontrola nezávislej D1 obnovy a cache invalidácie; prípadné externé/CDN cache môžu dočasne uchovať starú verziu. Nevytvárať falošnú garanciu vymazania backupov alebo osobných údajov.

**Žiadne produkčné údaje sa počas tohto PR nemažú.**
