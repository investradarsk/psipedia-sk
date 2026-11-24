# Psipedia.sk — Partner podania — krok 3/8 (zjednotenie tvorby profilov)

Dátum: 23. 11. 2026. PR #1566, stále Draft. Krok 3 nadväzuje na audit 1/8 a návratové URL 2/8.

## Výsledok

Nové hlásenia strateného alebo nájdeného psa od návštevníka prechádzajú **iba cez overený Partner účet** a existujúci systém kanonických konceptov. Žiadny nový shadow model, duplicita profilov, samostatné schvaľovanie či nová D1 migrácia.

### Verejné vstupy

- `/pomoc-psom/stratene-psy` -> `/partner/koncepty/novy?typ=LOST_FOUND_DOG&druh=LOST`.
- `/pomoc-psom/najdene-psy` -> `/partner/koncepty/novy?typ=LOST_FOUND_DOG&druh=FOUND`.
- Spoločný banner Pomoc psom -> `/partner/koncepty/novy?typ=LOST_FOUND_DOG` (výber typu v editore).
- Historická adresa `/pomoc-psom/stratene-a-najdene/nahlasit` presmeruje na rovnaký Partner editor; povolený parameter `druh=LOST|FOUND` zachová.
- Pri nezalogovanom používateľovi sa cieľ bezpečne zachová cez login/registráciu, e-mailový odkaz, Google a onboarding (krok 2).

### API cutover

`POST /api/lost-found/submissions` vracia **410 Gone** s `code: PARTNER_ACCOUNT_REQUIRED` a kanonickým partner cieľom. Nečíta request body, nepripravuje R2 obrázky, nezapisuje do D1 a nezakladá moderáciu. Neplatný starý HTML klient alebo automatizovaný odosielateľ preto nemôže obísť registráciu. Nová tvorba používa existujúce `POST /api/partner/canonical-drafts` (session, onboarding, same-origin guard) a následný autorizovaný SUBMIT.

**Historické dáta:** existujúce záznamy `PUBLIC_REPORTER`, všetky statusy `PENDING/ACTIVE/RESOLVED`, `lost_found_dog_private_details`, fotografie a Admin moderácia zostávajú nedotknuté. Kód `lib/lost-found-public-store.ts`, `lib/lost-found-public-media.ts`, `lib/lost-found-public-moderation.ts` sa nemaže, keďže staré hlásenia stále potrebujú editáciu, dohľadateľnosť a moderáciu.

### Parita hlásenia

| Údaj / správanie | Partnerské riešenie |
| --- | --- |
| LOST vs FOUND | Explicitne predvolený typ z URL alebo výber v editore |
| Dátum udalosti | Dátumový ovládač, pri SUBMIT nesmie byť v budúcnosti |
| Posledné videnie | V prípade LOST povinný čas s `datetime-local`; prevod Europe/Bratislava ↔ UTC ISO, pri FOUND pole skryté |
| Pes | Meno, pohlavie, plemeno, farba, vek, veľkosť, čip, rozpoznávacie znaky, obojok |
| Lokalita | Kraj a obec povinné pred SUBMIT; okres a približná lokalita nepovinné |
| Opis | Minimálne 20 znakov pri SUBMIT, koncept možno uložiť neúplný |
| Fotografia / galéria | Existujúce privátne PartnerMediaField + PartnerGalleryField, prílohy sa publikujú až pri schválení |
| Súkromný kontakt | Overená e-mailová identita a súkromný kontaktný profil Partner účtu. Nevypĺňajú sa nimi `public_email/public_phone`. Admin komunikuje v súkromnom chate. |
| Voliteľný verejný kontakt | `public_email`, `public_phone`, `public_contact_note` iba po výslovnom vyplnení používateľom |
| Stav vytvorenia | DRAFT -> SUBMITTED -> Admin schválenie/zamietnutie/vrátenie cez existujúce `moderation_submissions` |
| Vlastníctvo po schválení | Existujúci workflow automaticky zriadí schválený Partner help claim/OWNER pre rovnaký kanonický profil (krok 4 preverí staré claims) |

### Validácia a zápis

- `lib/partner-lost-found-intake.ts`: spoločná validačná funkcia klient/server. Počas SAVE sa nevyžaduje kompletný formulár. Pri SUBMIT sú povinné staré základné údaje.
- `lib/partner-canonical-workflow.ts`: rovnaká kontrola serverovo pred `applyAtomicModerationTransition`; kontrola `updated_at` chráni pred súbežnou zmenou počas odoslania.
- `components/partner-canonical-draft-form.tsx`: vysvetlenie súkromných a verejných kontaktov, datetime vstup, validácia pred SUBMIT. Pri FOUND sa neodosiela starý čas posledného videnia z LOST.
- SQL CHECK bezpečnosť: prázdne hodnoty enum polí LOST/FOUND (`sex,size,chipped,public_location_precision`) sa mapujú na existujúce enum defaulty (`UNKNOWN/MUNICIPALITY`), takže koncept možno uložiť aj čiastočne.
- Žiadne automatické prepísanie/doplnenie súkromných polí `lost_found_dog_private_details` cez verejný profil; kontakty sú na Partner účte. Privátne historické reporty zostávajú v pôvodnej tabuľke.

## Testy

- `tests/partner-intake-step3.test.mjs`: submit-only požiadavky, letný/zimný čas Slovenska, súkromné kontakty, staré API.
- `tests/lost-found-public-submission.test.mjs`: starý store a moderácia sú zachované; verejný POST už nie je aktívny.
- `tests/partner-intake-step2.test.mjs` a `tests/public-help-followup-20261113.test.mjs`: nové presmerovania.
- `tests/e2e/lost-found-dogs.spec.ts`: stará URL + bezpečný 410, žiadny nový anonymný záznam; doterajšie testy Admin editora a verejných detailov ostávajú.
- `tests/e2e/partner-auth.spec.ts`: na overenej Partner session sa vytvorí LOST/FOUND súkromný koncept, kontroluje sa utajenie verejného kontaktu, nevydanie verejného záznamu pred moderáciou a následné odoslanie.
- `tests/e2e/photo-banner-copy.spec.ts`: nový bannerový cieľ.

Lokálny návrh spustenia:
```sh
node --experimental-strip-types --test tests/partner-intake-step2.test.mjs tests/partner-intake-step3.test.mjs tests/lost-found-public-submission.test.mjs tests/public-help-followup-20261113.test.mjs
```
Úplný Playwright a produkčný Worker runtime sa musia overiť v GitHub Actions pred merge; tento dokument ich automaticky nevyhlasuje za úspešné.

## Zostávajúce fázy a hranice

4/8 — vlastníctvo: regresné scenáre priradenia nového Partner vlastníka, bezpečné prevzatie starých anonymných profilov vrátane Mie, bez automatického priradenia podľa e-mailu.

5/8 — správa profilu: špecifické lifecycle tlačidlo „Pes sa našiel“, revokácia a úplné notifikovanie správy.

6/8 — e-maily a komunikácia: potvrdenie prijatia, schválenie, zamietnutie, vrátenie; správne a deduplikované správy vrátane opravenej šablóny z auditu.

7/8 — jednotný kompaktný Admin: link z podania priamo na Partner dossier/chat a história, bez kopírovania podkladových tabuliek.

8/8 — kompletné regresie, D1/Notion preflight, verzovanie, produkčný rollout.

**Dôležité:** PR zostáva Draft, a API cutover sa nesmie dostať do produkcie samostatne bez potvrdenia funkčného Partner CREATE/SUBMIT a existujúcich PENDING hlásení na Workers + D1. Používateľovi nevzniká vlastník starého historického profilu automaticky. 
