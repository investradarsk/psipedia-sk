# Psipedia.sk – Partner podania – krok 6/8 (e-maily, rozhodnutia a správy)

Dátum: 23. 11. 2026. PR #1566 (Draft). Pokračuje v krokoch 1/8–5/8.

## Východiskový stav a hranice

**Recyklovať, nevytvárať druhú frontu:** existuje `partner_notification_outbox` s UNIQUE `dedupe_key`, Resend provider, bezpečné šifrovanie partner e-mailov, cron retry, preferencia email_enabled a idempotency key. Privátne správy sú už v `partner_chat_messages` a `partner_chat_email_queue`: oznámenie partnerovi neobsahuje obsah správy ani prílohy. Prichádzajúca správa Partnera vytvára interné Admin upozornenie.

Žiadny nový databázový model, D1 CHECK migrácia, druhá e-mailová služba ani nové uloženie súkromných kontaktov.

## Nové notifikácie

| Zmena stavu kanonického podania | E-mailový typ v existujúcej DB | Správanie |
| --- | --- | --- |
| DRAFT / RETURNED → SUBMITTED | NEW_PROFILE_SUBMITTED alebo EVENT_SUBMITTED | Potvrdenie prijatia, vrátane opakovaného odoslania opraveného podania |
| PENDING_REVIEW → APPROVED | NEW_PROFILE_CREATED alebo EVENT_CREATED | Výslovne potvrdené **schválenie a zverejnenie** pre nový kanonický workflow |
| PENDING_REVIEW → REJECTED | NEW_PROFILE_REJECTED alebo EVENT_REJECTED | Informácia o zamietnutí a odkaz na Partner účet |
| PENDING_REVIEW → RETURNED | NEW_PROFILE_SUBMITTED alebo EVENT_SUBMITTED so špeciálnym kľúčom `partner-canonical-returned/<submissionId>/<transitionId>` | Správny text „Vrátené na doplnenie“ a odkaz na presný editor s dôvodom |

**Prečo nemá RETURNED vlastný databázový enum:** existujúci outbox má striktný D1 CHECK. Použitie kompatibilného typu a vyhradeného formátu UNIQUE dedupe key umožňuje odlíšiť `RETURNED` bez riskantného rebuild-u tabuľky, ktorý by mohol ovplyvniť iné automatizácie alebo autentifikačné e-maily. Rovnaký kľúč používajú e-mailové šablóny a Partner inbox; samotný typ nie je pri RETURNED autoritatívny.

## Účtovanie presne raz pri skutočnej zmene stavu

- `lib/partner-canonical-notices.ts` generuje kompatibilný typ, deduplikovateľný kľúč a D1 prepared insert.
- `lib/partner-canonical-workflow.ts` vkladá oznámenie do **tej istej D1 batch transakcie** ako skutočnú moderátorskú zmenu; pred akýmkoľvek vedľajším zápisom je `guard(db)` vyhodnocujúci `changes()=1`. Ak zlyhá súbežný CAS, rollback zabráni falošnému schváleniu, R2/owner zmenám a e-mailom.
- Výsledný koncept má jeden ID a históriu aj pri RETURNED → SUBMITTED; každý skutočný nový prechod má vlastný `transitionId` pre e-mail, ale opakované neplatné API volanie nevytvorí druhý e-mail.
- `INSERT OR IGNORE` + UNIQUE dedupe key, cron lease/retry a `Idempotency-Key` Resend chránia pred opakovaným doručovaním. Toto je **praktická deduplikácia**, nie neoveriteľná absolútna garancia provider-level exactly once v každej sieťovej poruche.
- Výpadok Resend nevracia stav moderácie späť na DRAFT ani APPROVED na PENDING; outbox ostane na retry podľa existujúcej politiky.
- Vypnuté voliteľné e-mailové oznámenia sa pri spracovaní označia EXPIRED; overovacie/prihlasovacie správy ostávajú osobitne povinné.

## Správny text správy a odkazy

- Nový kanonický APPROVED už nehovorí „vytvorený ako koncept“ – profil alebo podujatie **bolo zverejnené**. Staršie workflow, ktoré skutočne vytvárajú iba koncepty, si **zachovávajú pôvodnú šablónu** na základe odlišného dedupe key.
- RETURNED informuje, že redakcia požaduje doplnenie, ale e-mail **neobsahuje** internú poznámku, súkromné kontakty ani prílohy. Dôvod si Partner prečíta po prihlásení v `/partner/koncepty/<id>`.
- Prijatie/zamietnutie: odkaz na `/partner/ziadosti`, kde je v existujúcich zoznamoch podaní priamy link na kanonický editor / výsledok.
- Schválenie: odkaz na `/partner/profily` alebo `/partner/podujatia`.
- `lib/partner-inbox.ts` zobrazuje RETURNED so skutočným stavom a odkazom priamo na editor. Nezamieňa ho za druhé odoslanie.

## Správy Admin ↔ Partner

- Existujúce `sendPartnerChat`: pri správe od Admina vznikne riadok `partner_chat_email_queue` a generické „Nová súkromná správa“. Obsah a prílohy ostávajú len v Partner účte.
- Pri správe od Partnera vznikne existujúce Admin upozornenie; redakcia môže odpovedať v jednej konverzácii na Partner účet.
- Nepridávame paralelné e-mailové vlákno, ktoré by kopírovalo privátne správy a riskovalo únik údajov.

## Testy

- `tests/partner-intake-step6.test.mjs` overuje typy kompatibilné s existujúcim D1 CHECK, deduplikáciu, viacnásobné RETURNED → SUBMITTED, finálne APPROVE/REJECT, rollback pri nesúhlase moderácie, obsah šablón a privátne e-mailové oznámenie o správe.
- `.github/workflows/partner-auth-ci.yml` obsahuje test v spoločnom kroku Partner intake.
- Pre kontrolu v prostredí repozitára:
  ```sh
  node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test tests/partner-intake-step6.test.mjs
  ```

**CI/E2E neboli v rámci tejto fázy deklarované za úspešné.** Používateľ požiadal nečakať na výsledky CI. Zmeny zatiaľ sú iba v Draft PR, nie na produkcii.

## Pokračovanie

7/8 – centrálny kompaktný Admin podaní a dopytov; originálne editačné tabuľky a Partner chat zostávajú kanonické.
8/8 – finálne testy, preflight aktuálneho main, D1/Notion stav a bezpečné merge/nasadenie až po dokončení závislostí.
