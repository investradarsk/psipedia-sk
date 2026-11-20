# Psipedia.sk – Partneri V2, krok 4/8: kanonické návrhy a prvé schválenie

Dátum: 20. 11. 2026
PR: #1467, **Draft**. Nie je zmergnutý ani nasadený. **Žiadnu D1 migráciu nenasadzovať.**

## Kód v tejto vetve

- Použité existujúce \`createCanonicalDraft\` z \`lib/canonical-draft-service.ts\`. Voliteľný režim \`allowIncomplete\` zrušil povinnosť názvu/dátumu pri **súkromnom, nikdy nepublikovanom** koncepte; redakčné volania bez tohto režimu sú stále prísne. Technický typ (kategória, typ organizácie, LOST/FOUND, HELP_CASE category) zostal potrebný.
- Nová spoločná doménová implementácia \`lib/partner-canonical-workflow.ts\` pracuje nad pôvodnými tabuľkami \`directory_profiles\`, \`help_organizations\`, \`managed_events\`, \`adoption_dogs\`, \`lost_found_dog_reports\`, \`help_cases\`. Koncept je reálna D1 entita so stavom \`draft\`/\`DRAFT\`; nie je verejne publikovaný.
- Existujúci \`moderation_submissions\` má len jednu žiadosť pre koncept, zviazanú cez \`subject_id\`. Jej počiatočný stav \`DRAFT\` sa nezarátava medzi odoslané žiadosti; pri odoslaní sa mení na \`SUBMITTED\`. Stav \`RETURNED\` sa vráti do \`SUBMITTED\` bez zakladania druhého záznamu; dôvod je zapísaný v \`moderation_events.reason_code\`.
- Povolené úpravy pred prvým schválením (aj počas čakania) ukladajú iba allowlist verejných polí priamo do kanonickej entity. Zapisujúci musí byť presne ten istý aktívny overený partner; SQL porovnáva \`updated_at\` a kontroluje schvaľovací stav v jednej transakcii. Stará verzia záznamu -> konflikt 409; cudzie profily -> 404.
- \`APPROVE\` zo zabezpečeného Admin API prepne ten istý D1 koncept na zverejnený status, nastaví \`published_at\`, udelí jeden OWNER (alebo schválený Help claim), zapíše \`Odkontrolované\`/review lock aj 0173 Directory SQL projekciu v jednej transakcii, priradí pôvodné submission metadata, audit a notifikáciu. \`REJECT\` nechá koncept neverejný; \`RETURN\` vyžaduje slovenský dôvod.
- V pôvodných šiestich Admin editoroch je panel \`AdminPartnerCanonicalDraft\` so schválením, zamietnutím a vrátením. Neexistuje druhá redakčná kópia. Panel zobrazuje aj neodoslaný koncept (bez moderátorských tlačidiel).
- Staré Admin CREATE rozhodovacie funkcie \`lib/partner-new-profile-admin.ts\`, \`lib/partner-events-admin.ts\`, \`lib/partner-help-create-admin.ts\` detegujú \`subject_id\` a delegujú na novú doménovú implementáciu; nesmú naklonovať druhý profil. Historické nevytvorené legacy submissions naďalej obsluhujú pôvodné vetvy.
- Staré PARTNER endpointy na \`WITHDRAWN\` po novom kontrolujú \`subject_id\` a odmietajú stiahnutie nových kanonických návrhov aj pri priamom volaní API. Historické legacy žiadosti sa pre spätnú kompatibilitu zatiaľ správajú po starom.
- \`/partner/koncepty/novy\`, \`/partner/koncepty/[id]\`, partner-only API \`/api/partner/canonical-drafts\`, \`/api/partner/canonical-drafts/[id]\`. Na domovskej partnerskej stránke je nové tlačidlo a zoznam rozpracovaných/čakajúcich konceptov. Spoločný formulár má prvú verziu polí a \`Uložiť koncept\` / \`Odoslať na schválenie\`.
- V Partneri Admin a partnerských žiadostiach sa \`DRAFT\` neschováva ako odoslaný návrh; je oddelený od čakajúcich podaní.
- Registrácia číslo organizácie **nie je v novom Partner formulári ani API allowliste**. SEO, interné polia, publish state a owner sú tiež zakázané.

## Schéma – nulová nová migrácia

\`moderation_submissions.status\` je existujúce TEXT bez CHECK enumu. \`DRAFT\` a \`RETURNED\` sa pridávajú do aplikačných stavov v \`lib/moderation-transition.ts\` bez DDL; historické hodnoty a staré ID zostanú zachované. Metadáta pre nový adresár/org/podujatie sa viažu cez už existujúce tabuľky; Help CREATE používa rovno základný \`moderation_submissions\`.

DÔLEŽITÉ: 0171/0172 boli už nasadené, 0173 má samostatný SQL cutover; 0174 patrí migrácii plemien. Nevytvárať druhú migráciu s tým istým číslom a neaplikovať generický backlog.

## Stav kvality – NEMERGOVAŤ

- Pridané \`tests/partner-canonical-step4.test.mjs\` – SQLite test generických kanonických draftov všetkých šiestich agend bez povinných verejných údajov; pôvodná strict validácia; stavový graf; statické API/ownership/review/withdraw kontrakty.
- Rozšírené \`tests/moderation-atomicity.test.mjs\` o dva nové workflow stavy; existujúce CRUD a ownership testy zostávajú.
- Výsledky **cieleného lokálneho testovania, kompletného build/lintu, reálneho D1 batch/rollback a E2E nie sú potvrdené ako zelené**. Partner security CI workflow sa na Draft PR preskakuje.
- Admin visual CI kontrola 20. 11. najskôr padla na zdrojovom regexe požadujúcom \`role="search" aria-label="Filtrovať partnerské účty" data-admin-list-filters\` v jednom riadku; značkovanie stránky sme opravili. Nový zelený výsledok po oprave treba ešte overiť.
- \`main\` sa zároveň mení kvôli súbežným SQL/Notion projektom. Pred merge treba preriešiť GitHub divergence a opakovať CI.

## Dokončenie a regresie pred merge

1. **Tvrdo overiť v D1 dev/staging**: 6× CREATE DRAFT / SAVE / SUBMIT / RETURN+note / RESUBMIT / APPROVE; publikované iba po approval; odmietnutie nepublikuje.
2. V tom istom testovacom D1 overiť \`changes()\` CAS guard, ochranu súbežného SAVE vs schválenie, D1 \`batch\` rollback, FK/unikátne kľúče OWNER a event sync lock.
3. Previesť priamy public update po prvom schválení, overiť reálny verejný web a HTML cache invalidáciu (najmä podujatia) a permanentný Notion zámok.
4. **Staré create formuláre zostávajú počas Draft prestavby dostupné** a na rozdiel od nového formulára stále ukladajú historické moderované podania. Pri finálnom kroku 6 zosúladiť/routovať všetky vstupy do jedného nového workflow; inak by existovali dve UX cesty.
5. Prvá verzia nového generického partner formulára **ešte nie je plná parita všetkých verejných polí, galérií ani súkromný náhľad**; tieto položky patria kroku 6. Čistý \`beforeunload\` guard nesmie byť vydávaný za úplnú ochranu Next client-side navigácie.
6. **V bežných kanonických zoznamoch** zviditeľniť značku „Partnerský koncept“ (zatiaľ viditeľná v detaile/editore).
7. Doplniť ochranu pred náhodným manuálnym publikovaním/odstránením nevybaveného partner draftu cez klasický Admin editor; bez toho hrozí obídenie schvaľovania.
8. Admin audit OLD/NEW a notifikácie po priamych úpravách sú krok 5; chat a jeho unread stavy až krok 7. Výstup nie je hotový produkčný systém.

## Stav kroku

**4/8 – zmeny sú zapracované na pracovnej vetve PR #1467, integrovanej regresie a merge však čakajú.**
Nasleduje **5/8 – partner ownership a lifecycle, podrobný audit a admin upozornenia.** Pred nasadením sa musí overiť aj časť bodov vyššie, pretože workflow zatiaľ nie je bezpečné deklarovať ako produkčne dokončené.
