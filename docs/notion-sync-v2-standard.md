# Notion Sync V2 — krok 1/12: referenčný model Podujatí

Rozsah: `directory`, `breeds`, `events`, `organizations`, `adoptions`, `lost-found`, `help-cases`, `eshops`.
Články, Facebook a katalóg služieb V3 si zachovajú svoje špecifické pracovné postupy. Spoločná infraštruktúra nesmie zmeniť ich správanie.
D1 je kanonický zdroj. Notion a Admin sú rovnocenné redakčné vstupy iba pre povolené redakčné polia. Toto je implementačný kontrakt PR #1606, nie vyhlásenie o nasadení.

## 1. Referenčný tok v aktuálnom kóde

| Miesto | Overené správanie | Rozhodnutie V2 |
| --- | --- | --- |
| `lib/notion-event-field-contract.ts` | Allowlist 31 ciest, opaque Notion property ID -> logická cesta, diff Admin pred/po, zachovanie neupravených polí a imageKey, odmietnutie neúplného rich textu | Zachovať typované registre a presné selektory pre každú agendu |
| `app/api/admin/events/[id]/route.ts` | Povinný expectedUpdatedAt; nezhoda verzie odmietne zápis; uloženie D1 oddelené od Notion výsledku | Zachovať CAS aj oddelené stavy; receipt viazať na skutočne potvrdený rozdiel, nie iba zoznam z klienta |
| `lib/notion-webhook-contract.ts`, `lib/notion-webhook-inbox.ts` | Podpis raw body; deduplikácia; D1 pred HTTP 200; lease, limit 12 pokusov, review, serializácia jednej stránky | Reuse, doplniť pôvodné event ID/čas a dôkaz pôvodu bez falošného priradenia neskôr prečítanej hodnoty |
| `lib/notion-webhook-dispatch.ts` | GET stránky, kontrola zdroja, vynechanie archívu a metadát; mapované Podujatia idú cez syncEventNotionFields; nové stránky cez existujúci importný gate | Zachovať oddelenie create/import a update; neznáme property ID nesmie spustiť full replay |
| `lib/notion-event-field-sync.ts:219–258` | Notion -> D1 iba zmenené property IDs; overenie mapovania, Psipedia ID, URL a zdroja; samostatné chyby; CAS skalárov | Zachovať; doplniť verifikovaný field baseline/revision pred každým zápisom a lock v okamihu commit |
| `lib/notion-event-field-sync.ts:263–322` | Admin -> Notion iba vybrané polia plus úvodný backfill; kontrola identity; PATCH jednotlivo a kontrola echo | Zachovať selective PATCH; odstrániť bezpodmienečné backfilly z bežného replay, doplniť outbox, re-read a kontrolu poslednej zmeny |
| `lib/admin-notion-review-lock.ts` | D1 review aj aktuálne partner owner; chyba schémy fail closed | Zdieľať politiku naprieč agendami, zachovať scope a výnimky publikovania |
| `lib/notion-events-help-sync.ts:872–884` | Cron preskakuje mapované záznamy kvôli field event režimu | Nahradiť preskočenie kontrolovaným inkrementálnym catch-up; nikdy slepý whole-profile merge |
| `lib/notion-help-admin-outbox.ts` | Help má pred/po hodnoty, verziu fronty, lease, retry, overenie mapovania a kontrolu novšej hodnoty; konflikt jedného poľa blokuje celý retry | Použiť najlepšiu existujúcu ochranu aj pre Podujatia a ostatné agendy, izolovať jednotlivé polia |

Overené čítaním aktuálneho main a vetvy PR: event contract, event field sync, Admin event route, inbox a targeted Admin save sú zhodné na úrovni blob SHA. Events/Help sync sa na vetve líši už zavedeným changedSideWins. Žiadne produkčné meranie ani testy v kroku 1.

## 2. Povinný kontrakt spoločného jadra (krok 2)

Každá agenda registruje kanonický typ identity, mapovanie data source/page/entity, explicitnú množinu povolených ciest, typované SQL read/write, normalizáciu, validáciu, ochrany, media/relations a lifecycle. Žiadna dynamická SQL identifikácia z Notion vstupu. Reuse existujúce `notion-profile-field-reconciliation.ts`, `notion-profile-field-baseline.ts`, `notion-selective-property-patch.ts`, inbox, review a lifecycle. Adapter nie je ďalší nezávislý sync engine.

1. Admin, oprávnený partner, automatizácia alebo Notion edit vstupujú cez overenú identitu a svoj povolený editor. Zaznamenať len skutočne zmenené polia, nie sync echo ani systémové aktualizácie.
2. Admin zápis do kanonickej SQL projekcie používa CAS, pričom field receipt a trvalý outbox musia vzniknúť atomicky s úspešným zápisom (alebo spoľahlivo obnoviteľným transakčným journalom). Čas servera pri commit, jedinečné edit ID, per-field revízia, hash skutočne uloženej normalizovanej hodnoty a scope. Retry nesmie meniť čas editu.
3. Notion inbox zachová autentifikované event ID, zdrojový timestamp, authors/type ak sú dostupné, dotknuté property IDs a scope. Webhook neobsahuje hodnotu: timestamp starého eventu nesmie byť priradený k ľubovoľnej aktuálnej GET hodnote. Zlúčené, oneskorené a neúplné udalosti môžu znížiť presnosť dôkazu. Notion page last_edited_time ani D1 updated_at nie sú per-field user edit timestamps. Dôveryhodný receipt len pri preukázateľnej väzbe času, identity a konkrétnej hodnoty. Ak to API neumožní, konflikt ostáva explicitne nerozhodnutý. Poradie doručenia ani worker clock nie sú náhradou.
4. Overiť mapping a lifecycle pred čítaním/zápisom; lock pri claim aj tesne pred mutáciou a podľa možnosti atomicky v SQL. Zamknuté records nesmú dostať žiadne redakčné prenosy. Sync metadata majú oddelený whitelist. Odomknutie je potvrdený plný export SQL do presne mapovanej stránky; zneplatniť staré čakajúce edit receipts, nezrušiť partner lock.
5. Použiť overený spoločný field baseline, nie celoprofilový timestamp. Porovnať nezávislé zmeny, vybrať výsledok nižšie. Po potvrdenom zápise oboch strán aktualizovať receipt/baseline konkrétneho poľa; nevydávať plný hash za úspešný pri nedokončených poliach.
6. PATCH len požadované polia, znovu overiť aktuálnu hodnotu, identitu a dostupnú revíziu; kontrolovať echo odpovede. Notion PATCH neposkytuje overený atómový compare-and-swap, preto medzi GET a PATCH ostáva race window. Serializovať vlastné prenosy, overiť po zápise, pri zistenom súbehu neprepisovať opakovane; zachovať dôkazy na obnovu. Neprisľubovať absolútnu ochranu pred externým súbehom.
7. Výsledok poľa: unchanged, applied, pending, conflict, invalid, locked, unlinked. Úspech ostatných polí nie je dôkaz opravy chyby. Neúspešná Notion operácia nesmie zvrátiť potvrdený D1 commit.

### Rozhodovacia tabuľka

| Situácia | Výsledok |
| --- | --- |
| Jedna strana skutočne zmenila pole oproti overenému baseline | Prevezmi zmenu bez historickej Notion/Admin priority, ak prejde ochranami |
| Obe strany zmenili odlišné polia | Zachovaj obidve |
| Obe majú rovnakú normalizovanú hodnotu | Konvergencia, žiadny zbytočný zápis |
| Obe zmenili to isté pole na iné hodnoty, obidva receipts spoľahlivé a viazané na hodnotu | Novší zdrojový edit vyhráva (last-write-wins) |
| Čas, hodnota alebo baseline chýba, časy sú rovnaké, prípadne edit nie je jednoznačne doložený | Izolovaný review; nestratiť ani jednu verziu, nevymýšľať víťaza |
| Notion prázdne/absent/neúplne načítané pole | Neprepísať neprázdnu SQL hodnotu; prázdne Notion nie je potvrdený delete |
| Výslovné vymazanie v oprávnenom Admin editore | Cielený clear s overeným receiptom; povinné a chránené údaje ostávajú validované |
| Chránené identitné, publikačné, moderačné alebo potvrdené geo pole | Zachovať doterajší kanonický workflow, nie všeobecné LWW |
| Review/partner lock, tombstone, mapovanie mimo data source | Žiadny redakčný zápis |

Zákaz implicitného Notion clear je úmyselná zmena oproti Podujatiam, kde validácia dnes prijíma niektoré prázdne signed edit hodnoty (`saveField`). Voliteľný explicitný Notion clear vyžaduje osobitné potvrdenie používateľa a zdokumentovaný mechanizmus, nie iba zoznam zmenených property IDs.

## 3. Riziká zistené v referenčnom modeli a akceptačné kritériá

- P0: oneskorený webhook môže načítať starú Notion hodnotu a saveField ju zapíše proti práve načítanej D1 revízii. CAS chráni iba pred zmenou medzi čítaním a commitom, nie pred starou udalosťou. Test oboch poradí, opakovaného doručenia, sync echo a zmeny hodnoty po vzniku webhooku.
- P0: Admin syncEventAdminFields nenačítava per-field revision a nemá rovnaký trvalý outbox ako Help. PATCH môže prepísať čerstvú Notion zmenu. Test pádu po D1 commit pred PATCH, po PATCH pred potvrdením, súbehu, starého retry a odlišného echo.
- P0: hodinový sweep zámerne preskakuje mapované records. Zaviesť bounded keyset/cursor catch-up, ktorý porovnáva dôveryhodné field baseline a nedotkne sa unrelated fields. Test vynechaného webhooku aj obnovy výpadku bez celoplošného replay.
- P0: Notion pull event kontroluje lock pred cyklom, nie v každom commit predikáte. Test súbežného review/partner grant, unlock export a tombstone. Zachovať bezpečné retry aj po lock.
- P1: backfill kontaktu, keyword a obrázka pri hociktorom Admin save môže obísť edit intent. Iba overený bootstrap alebo explicitná oprava, rešpektovať novší edit.
- P1: `saveField` priamo mení `managed_events.seo_json`. Nie je dôkaz, že tento konkrétny stĺpec bol odstránený. Overiť proti aktuálnemu SQL modelu Podujatí pred migráciou adaptera; neodstraňovať platný kanonický stĺpec iba pre jeho názov. `updated_at` musí striktne narastať aj pre dve field operácie v jednej ms, reuse monotonic helper.
- P1: date range a súvisiace media/relations vyžadujú atómovú validáciu logickej skupiny, inak môže legitímna zmena začiatku aj konca čiastočne zlyhať. Zachovať izoláciu nezávislých polí.
- P1: invalidná/neúplná Notion hodnota sa nesmie zmeniť na prázdny údaj; zachovať rich text a pagináciu, R2 media ownership, nepoužiť zlyhanie jedného poľa ako dôkaz celej synchronizácie.
- P1: historické authority settings a fallback priority režimy nemožno považovať za novší edit. Nechať ich iba pre explicitné manuálne potvrdené recovery, kým sa odstránia z bežnej synchronizácie.

## 4. Implementačné etapy v PR #1606

- [x] 1/12 — referenčná analýza Podujatí a tento záväzný spoločný kontrakt
- [ ] 2/12 — spoločné jadro, receipt/evidence kontrakt, field baseline, trvalá fronta; pripraviť migráciu len podľa schváleného migration procesu; pripojiť referenčné Podujatia, nie iba helper bez volajúceho
- [ ] 3/12 — Adresár vrátane multi-category a Services V3 špecifických väzieb
- [ ] 4/12 — Plemená, aktívna workcopy, komplexné polia a väzby; neaktivovať starý engine
- [ ] 5/12 — Organizácie
- [ ] 6/12 — Adopcie
- [ ] 7/12 — Stratené a nájdené
- [ ] 8/12 — Ostatná pomoc psom
- [ ] 9/12 — E-shopy (hodnotenia a stav sú kanonické)
- [ ] 10/12 — webhook/catch-up, retry, mapovania a konflikty
- [ ] 11/12 — manuálny prenos, diagnostika, výkon a odstránenie duplicít
- [ ] 12/12 — integrácia a testy všetkých ôsmich agend, overenie no regressions v excluded scopes

Pred každým adapterom porovnať main, SQL read/write, všetky aktuálne Notion properties, data source a mapping; pre Help/Lost-found odlíšiť plný data source od prázdneho shell. Auditovať aj create/import a delete lifecycle. Nahrádzať staré mechanizmy až po preukázaní parity, nevytvoriť druhý aktívny engine.

## 5. Testovací gate

Existujúce regresné základy: `tests/notion-event-field-contract.test.mjs`, `tests/admin-event-save-concurrency.test.mjs`, `tests/notion-targeted-webhook.test.mjs`, `tests/notion-events-help-bidirectional.test.mjs`, `tests/notion-profile-field-reconciliation.test.mjs`. Pridať runtime integračné testy pre každú agendu, obidva smery, všetky P0 scenáre, prázdne polia, chybné mapping, cron recovery, CAS, explicitný clear, partner/review, unlock, delete, schema drift a long text. Testy musia používať izolovanú databázu a mock Notion/R2. Existujúce testy zatiaľ iba identifikované, nespustené v kroku 1. Produkčné počty, logy a reálnu rýchlosť nemožno potvrdiť z repozitára. Žiadny merge/deploy/produkčná D1 mutácia.
