# Psipedia.sk – Partner podania – krok 5/8 (správa profilu a uzavretie hlásenia)

Dátum: 23. 11. 2026. PR #1566 (Draft). Krok 5 dopĺňa 1/8–4/8. Bez migrácií a bez druhého systému moderácie.

## Čo už existuje a zostáva

- Správa vlastných služieb, organizácií, podujatí, adopcií a Pomoci psom cez jeden Partner účet, s existujúcim D1 OWNER/partner_help_claims modelom.
- Partner help editor: povolené verejné polia, fotografie, galéria; priamy autorizovaný zápis s `updated_at` CAS, nezapisuje súkromné kontakty, SEO, status ani vlastníctvo.
- Žiadosti o skrytie, archivovanie, vzdanie sa správy a zrušenie účtu zostávajú pod Admin moderáciou (`PartnerLifecycleRequest`). Žiadna z týchto akcií sa nesmie zmeniť na okamžitý hard delete.

## Nová jednoúčelová akcia „Pes sa našiel“

Pre schváleného správcu aktívneho zverejneného záznamu LOST/FOUND:

- LOST: tlačidlo **„Označiť psa ako nájdeného“**.
- FOUND: tlačidlo **„Označiť ako vráteného majiteľovi“**.
- Obe znamenajú kanonický prechod `ACTIVE -> RESOLVED`, ktorý existujúca doména povoľuje.
- Pred akciou sa vyžaduje potvrdenie a žiadne neuložené polia vo formulári. Po uložení upravených polí sa musí obnoviť editor.
- Po úspechu klient zavolá `router.refresh()` a oznámi, že hlásenie je vyriešené.
- Zmena sa vykoná okamžite v D1 bez ďalšieho schválenia (vlastník len potvrdzuje vyriešenie), ale je auditovaná a Admin dostane interné upozornenie.

### Autorizácia a bezpečný zápis

`PATCH /api/partner/help-records/[resourceId]/resolve`:

1. Partner session, dokončený onboarding a CSRF/origin kontrola.
2. Prijíma **iba** `{baseRevision}`, neprijíma svojvoľné statusy, ID, e-maily ani partner ownership.
3. `resourceId` musí byť presne LOST_FOUND_DOG; pred zápisom `requirePartnerPermission(...,HELP_EDIT_PUBLIC)`.
4. Server kontroluje ACTIVE, už publikovaný profil, bez duplicity a bez expirácie.
5. **Rovnaký SQL UPDATE má aj CAS a OWNER predicate**: `updated_at=?`, aktívny účet, schválený partner_help_claims. Pri súbehu edit/revoke sa stav nezmení, ani nevznikne audit/notification.
6. V transakčnej D1 batch sa zapíšu iba `status='RESOLVED'`, `resolved_at`, `updated_at`, interný `partner_audit_events` a `admin_notification_events`.
7. Staré URL, názov psa, kontakty v `lost_found_dog_private_details`, fotografie, galéria, dátum posledného videnia a historická moderácia sa nemenia. Jediné pôvodné kanonické ID zostáva.
8. Opakované kliknutie alebo starý formulár sa odmietnu bez duplikovaného uzatvorenia.

### Verejný web

- Podľa existujúcej `lib/lost-found-dog-store.ts` zostane verejný DETAIL pre stav RESOLVED dostupný na pôvodnom slugu.
- Verejné zoznamy a vyhľadávanie aktívnych hlásení používajú `status='ACTIVE'` → vyriešený pes z nich zmizne.
- Existujúci `lostFoundStatusShouldIndex` indexuje len ACTIVE → vyriešený prípad dostane `noindex`.
- Detail teraz rozlišuje ľudský text: „Pes sa našiel“ / „Pes sa vrátil majiteľovi“.
- Po D1 commit sa invaliduje versioned Worker public HTML cache: detail, oba zoznamy a /pomoc-psom. Chyba cache nezmení úspešný D1 výsledok.

### Notion

- Pred zápisom sa zachytí aktuálny snapshot kanonického záznamu.
- Po úspešnom D1 commite sa použije **existujúca** `syncSavedNotionRecord` cesta pre agendu lost-found; prenos je po poliach, outbox/retry a konfliktová ochrana ostávajú rovnaké ako pri Admin save.
- Výsledok Notion `synced/pending/review/disabled/unlinked` je oddelený od výsledku D1. E-mail/notion chyba nesmie vrátiť status psa späť na ACTIVE.
- Ak je daný záznam zamknutý review-lock pravidlom, `isAdminNotionSyncLocked` ponechá Notion v stave `disabled`; tento krok nezavádza výnimku na obídenie review locku.

## Testy

`tests/partner-intake-step5.test.mjs` vykonáva reálny SQLite UPDATE s rovnakým SQL:
- úspešný jediný prechod schváleného OWNER,
- ochrana historickej identity, slugu, obrázka, neverejných kontaktov,
- konflikt cudzieho accountId, PENDING/REVOKED vlastníka, SUSPENDED/DEACTIVATED účtu,
- stale `updated_at`, publikovanie, duplicita, expirácia a už vyriešený stav,
- API session, input allowlist, klientske potvrdenie a ochrana neuložených zmien,
- audit, Admin notification, Notion snapshot poľa a invalidácia cache.

CI: `.github/workflows/partner-auth-ci.yml` zahŕňa nový test. User požiadal **nečakať na CI**. Preto sa v kroku 5 netvrdí, že úplný GitHub CI/E2E je úspešný alebo že zmena beží v produkcii.

## Nasledujúce kroky

6/8 — e-maily: potvrdenie odoslania, schválenia, zamietnutia, vrátenia a správ, deduplikované a doručované cez existujúci outbox.
7/8 — spoločný Admin pre podania a dopyty s prepojeniami do kanonických agenda editorov a Partner chatu.
8/8 — komplexné integračné testy, preflight aktuálneho main a nasadenie až po potvrdení Worker/D1/Notion.

PR #1566 zostáva Draft; nič sa neaktivuje na produkcii bez následného merge a nasadenia.
