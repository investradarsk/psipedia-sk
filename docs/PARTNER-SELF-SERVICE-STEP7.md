# Psipedia Partner – krok 7/8: administrátorská moderácia nových záznamov Pomoci psom

## Príjem → redakčná kontrola → koncept

Partner vyplní nový návrh cez existujúcu obrazovku `/partner/pomoc/nova`. Vznikne iba `moderation_submissions` s `operation='CREATE'`. Administrátor na `/admin/partners/help-submissions/[id]` môže:

1. Skontrolovať pôvodne odoslané údaje, typ, varovania na duplicity a históriu moderácie.
2. **Zmeniť verejné hodnoty pred schválením** v rovnakom typovanom formulárovom kontrakte, ktorý používa Partner. Zmenená plná sada dát prechádza identickou prísnou serverovou validáciou. Pôvodný návrh sa neprepisuje, audit a moderácia zaznamenajú zásah administrátora.
3. Schváliť ako **nezverejnený koncept** v príslušnej kanonickej tabuľke: `adoption_dogs.status='DRAFT'`, `lost_found_dog_reports.status='DRAFT'`, `help_cases.status='draft'`. Slug generuje server s kontrolou kolízií; SEO, publikovanie, systémové a súkromné polia nie sú nastaviteľné ani admin editačným formulárom.
4. Ak je záznam duplicitný, **LINK_EXISTING** pripojí návrh k existujúcemu kanonickému ID bez prepisu jeho aktuálnych hodnôt. Nikdy nevytvorí druhý verejný záznam.
5. Zamietnuť návrh s dôvodom. Pôvodný návrh aj historia rozhodnutia zostávajú zachované.

## Databázové invarianty

- Rozhodnutie využíva existujúci `applyAtomicModerationTransition` a D1 `batch`: stav moderácie, kanonický INSERT, schválená väzba `partner_help_claims`, `subject_id`, audit a partner notifikácia sú v jednej transakcii.
- V čase rozhodnutia sa overí aktívny účet partnera, pôvodná moderovaná operácia, oprávnený nezávislý administrátor, presný cieľ a duplicity. Zároveň sú tieto kritické podmienky opätovne v `transitionGuard`, nie iba v predbežnom SELECT-e.
- Schválená väzba `partner_help_claims.status='APPROVED'` predstavuje jediného správcu záznamu. Unikátne čiastočné indexy z pripraveného, **ešte nespusteného** D1 `0172` sú finálnou ochranou pred súbehom schvaľovaní.
- Prepojenie používa rovnaké predpoklady ako vytvorenie, ale **nemení obsah existujúceho záznamu**. Ak už má iného správcu, rozhodnutie skončí konfliktom. Už schválené vlastníctvo rovnakého partnera sa neduplikuje.
- Zápis tvorí append-only `partner_audit_events`, `moderation_events` a notifikáciu cez existujúci `partner_notification_outbox`. Používajú sa jestvujúce typy notifikácií `NEW_PROFILE_CREATED` / `NEW_PROFILE_REJECTED`, bez novej migrácie.
- Žiadny proces automaticky neprepína koncept na publikovaný stav; verejné zobrazenie je samostatným redakčným rozhodnutím.

## UI a testy

- Admin queue ponúka odkaz na detail a rozhodnutie, zachováva filtre aj varovanie na duplicitu.
- Formulárová metadátová sada sa nachádza v `lib/partner-help-create-form-fields.ts`, zdieľa ju Partner odoslanie a admin editácia. Nevytvárajú sa nové verejné komponenty ani druhá kanonická schéma.
- `tests/partner-help-review-step7.test.mjs` používa skutočný SQLite engine pre SQL INSERT, statusy DRAFT, schválené claimy, blokovanie druhého správcu, prechodové guardy a serverovú validáciu.
- Staré čakajúce žiadosti majú zachované pôvodné údaje; odvolané alebo už rozhodnuté stavy nemožno rozhodnúť znovu.

## Spustenie

**Krok 7 nevyžaduje novú migráciu.** Pripravené migrácie `0171` a `0172` zostávajú `UNACTIVATED`; bez nich nesmie byť nový systém spustený v produkcii. PR #1437 ostáva Draft, čaká na úplné zelené CI a finálny audit 8/8. Synchronizačné pravidlo D1 ↔ Notion pre súbežné edity toho istého poľa treba pred uvedením do prevádzky samostatne vyriešiť alebo explicitne definovať bezpečný konfliktový režim.
