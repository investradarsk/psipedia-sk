# Psipedia.sk — Partner podania — 8/8: finálny bezpečnostný a release preflight

**Dátum:** 23. 11. 2026  
**Vetva:** `feat/partner-jednotne-podania-20261123`  
**PR:** #1566 — nie je zlúčený ani nasadený.

## Rozsah kontroly

Preverované moduly: Partner registrácia a návrat do formulára, canonical DRAFT → SUBMITTED → PENDING_REVIEW → APPROVED/REJECTED/RETURNED, schvaľovanie v pôvodných Admin obrazovkách, OWNER/claim oprávnenia, historické `PUBLIC_REPORTER` hlásenia, RESOLVED lifecycle, súkromné kontakty, e-mailový outbox, Notion help writeback, nový jednotný Admin a jeho SQL projekcia.

Pri porovnaní s aktuálnym `main` v čase kontroly: GitHub `compare_commits` vrátil `status=ahead, behind_by=0`. `mergeable=true` podľa GitHub PR API, bez potvrdeného konfliktu. Opakovať porovnanie bezprostredne pred merge, ak medzičasom prídu ďalšie paralelné PR.

## Nájdené a opravené problémy

### 1. Historické verejné hlásenia v spoločnom Admine

`lib/admin-submission-inbox.ts` malo predčasný fallback pre `PUBLIC`, ktorý preskočil detail pôvodného profilu a otvoril iba všeobecnú agendu. Nová vetva `inboxReviewHref` používa konkrétne `inboxEditorHref(item)` pri platnom kanonickom ID a až potom bezpečný odkaz na zoznam. Súkromný `submitter_ref` sa nikdy nezobrazuje ako Partner konto.

### 2. Zmena údajov počas moderácie

Staré `editableStates` povoľovali partnerovi meniť uložený kanonický draft aj v `SUBMITTED`, `PENDING_REVIEW` alebo `QUARANTINED`. To ohrozovalo čitateľnosť redakčného rozhodnutia. Nový model:
- Partner môže upravovať len `DRAFT` a `RETURNED`;
- rovnaký limit v serverovej funkcii, v oboch SQL CAS podmienkach a v Partner UI;
- Admin môže vrátiť podanie na doplnenie. Partner upraví koncept a znova odošle pôvodné ID (nová udalosť a emailový outbox receipt);
- žiadne ďalšie skryté zmeny po odoslaní.

### 3. Schválenie proti presne otvorenej verzii

`decidePartnerCanonicalDraftAdmin(APPROVE)` teraz vyžaduje `expectedCanonicalUpdatedAt` a odmietne chýbajúcu alebo zastaranú verziu (`409 STALE_CANONICAL_REVIEW`). Existing canonical publication CAS na `updated_at` ochraňuje aj interval medzi kontrolou a transakčným commitom.

Na zdrojovom Admin detaily je `updated_at` načítané oddelene pre:
- Služby a organizácie: `getPartnerNewProfileAdmin` → `AdminPartnerNewProfileActions` → API → `createPartnerNewProfileAdmin`;
- Pomoc psom/adopcie/LOST_FOUND: `getPartnerHelpCreateAdmin` → `AdminPartnerHelpReviewActions` → API → `createPartnerHelpDraftAdmin`;
- Podujatia: už existujúce `current.updatedAt` → `AdminPartnerEventActions` → API → `createPartnerEventAdmin`.

Staré formuláre bez `subjectId` pokračujú vo svojom pôvodnom CREATE/UPDATE workflow. Nové kanonické CREATE s `subjectId` už neodosiela `editedPayload`, nevyvoláva staré vytvorenie druhej D1 entity, ale používa schválenie a publikovanie existujúceho konceptu.

### 4. Vrátenie na doplnenie

Nový zdieľaný klient `components/admin-partner-canonical-return.tsx` volá **existujúci** `PATCH /api/admin/partners/canonical-drafts/[id]` s `{action:"RETURN",note}`, najprv vyžaduje konkrétny dôvod a potvrdenie. Vložený je len pre aktívne kanonické podania na pôvodných Admin detailoch služieb, organizácií, podujatí, adopcií a Pomoci psom. Partner potom uvidí dôvod v existujúcom editore a môže opraviť údaje.

Neposielame internú poznámku v e-maile; len notifikáciu a odkaz na overenú stránku. Bez ďalšej D1 migrácie.

## Závislosti a integrita zachované

- Moderácia: `moderation_submissions` + `moderation_events`, transakčné CAS/guard a už existujúce schvaľovacie koncové body.
- Vlastníctvo: `partner_memberships` alebo `partner_help_claims`, aktívny účet, claim overenie starého verejného reportéra (nikdy automaticky iba podľa e-mailu).
- RESOLVED: iba schválený OWNER, status `ACTIVE → RESOLVED`, audit a Admin event v jednom D1 batch, originálna verejná URL a privátne záznamy zostávajú.
- E-maily: existujúci `partner_notification_outbox`, UNIQUE dedupe key, Resend retry; časový výsledok doručenia sa nepovažuje za stav D1 moderácie.
- Notion: existujúce pole-po-poli targeted save/outbox, rešpektovať zamknutie kontroly a rozdeliť D1 výsledok od Notion mirror; žiadne priame hromadné prepísanie.
- Jednotný Admin: read-only UNION nad pôvodnými tabuľkami, viazané parametre, stránkovanie po 30, žiadne privátne e-maily alebo kontakty v spoločnej tabuľke.

## Testy

Pridaný `tests/partner-intake-step8.test.mjs`: verifikácia uzamknutia predložených konceptov, prenosu verzie cez všetky Admin kanály, starého kontra kanonického schválenia, dostupnosti RETURN ovládania, bezpečného detailného odkazu na verejné hlásenia a zachovania Notion/outbox domén.

Existujúce regresné testy krokov 2–7 zostávajú. `.github/workflows/partner-auth-ci.yml` nový test zahrnie do security kroku.

### Nevyhnutné release gates

**NEOVERENÉ V TOMTO ČETE**: lokálny TypeScript build, lint, node test runner, worker bootstrap, Playwright desktop/mobil, reálne Cloudflare D1 integračné SQL, Resend test mailbox a Notion writeback live. GitHub CI pre Draft PR môže testy preskakovať; skip NIE JE zelená kontrola. Toto nie je potvrdenie produkčnej pripravenosti.

Pred merge treba mať zelený GitHub build/security/E2E test na aktuálnej revízii a minimálne overiť:
1. Nová registrácia → obnova pôvodnej LOST/FOUND URL → prvé uloženie súkromného konceptu → SUBMITTED.
2. Admin schváli s načítanou verziou, report sa zobrazí verejne, OWNER vidí profil a vie ho upravovať. Schválenie zo starej otvorenej karty musí vrátiť 409.
3. Admin vráti na doplnenie, Partner upraví a znova odošle; email receipt sa nevytvorí dvojmo.
4. Admin zamietne a nevytvorí sa verejný profil ani OWNER.
5. Starý anonymný prípad (napr. Mia) zostane v D1/Admin dostupný, jeho súkromné kontakty sa nezverejnia; bezpečný manuálny claim až po overení.
6. Schválený OWNER môže označiť LOST/FOUND ako RESOLVED, cudzí účet alebo stará revízia nedostane prístup.
7. Sekcia /admin/podania otvorí každé podanie v správnom pôvodnom editore a nikdy neprenesie PII z anonymous reportera do partner chatu.
8. Notion zamknutý záznam neprepíše D1; mailový výpadok nevráti moderáciu do predchádzajúceho stavu.

### Rollout a fallback

- V **tomto PR** stará anonymná URL presmeruje na Partner formulár a pôvodný `POST /api/lost-found/submissions` vracia 410. Ide o zámerný cutover, preto **nemergovať bez úspešne otestovanej novej autentifikovanej cesty**.
- Nie je potrebné prevádzať alebo vymazať staré anonymné hlásenia ani ich fotografie a kontakty. Nepotrebujeme novú D1 migráciu.
- Ak sa po merge ukáže zlyhanie, rollback musí vrátiť celú nasadenú Worker revíziu a súčasne overiť aktuálny stav D1/outbox; neodstraňovať novovytvorené profily ani vlastníctvo slepým SQL.

## Status pri odovzdaní

Zmeny 1–8/8 sú implementované na PR vetve, ale **CI/E2E/runtime validácia nie je potvrdená**. Merge alebo nasadenie zostáva samostatnou rozhodovacou akciou po zelených kontrolách.
