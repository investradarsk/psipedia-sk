# Adresár SQL – krok 3/4: audit parity skutočných SQL hodnôt

Dátum: 20. 11. 2026. Nadväzuje na zlúčené #1497 (opravný import) a #1499 (priebežné služby/obrázky).

## Čo sme dosiahli
- V produkcii úspešne prebehol `step3-repair` s `imported=1` a `status=STEP3_MISSING_PROFILES_STAGED`; neprepisoval staršie SQL receipty.
- Existujúce `step3-audit` predtým hlásilo iba rozdiely revízií a *potenciálne problémy v zdroji*. To **nie je** porovnanie hodnôt skutočne uložených v nových SQL tabuľkách.
- Tento PR pridáva iba **read-only**, paginované porovnanie s D1 pri rovnakom podpísanom Notion pôvode.

## Kontrolované polia
1. Usporiadané voľnotextové služby: `directory_profile_service_texts`, nikdy nezamieňať s Services V3.
2. Nastavenia miniatury a detailu: `directory_profile_image_display_settings`; chybné historické JSON je samostatný signál na kontrolu.
3. Technické zoznamy a explicitné prázdne zoznamy: `directory_profile_extra_list_state` + `directory_profile_extra_list_items`.
4. Doplnkové redakčné polia z Notionu: `directory_profile_extra_fields`; porovnávajú sa iba pri **zhodnej Notion revízii a overenom ID/kategórii/zámku**.

Ak `source_revision` nie je totožná s `directory_profiles.updated_at`, audit označí `d1_revision_changed` a nesmie predstierať aktuálnu paritu. Ak sa zmenila podpísaná stránka Notion, označí `notion_revision_changed` a neoznačí nové Notion polia ako rovnaké.

## Výstup
V artefakte `directory-step3-<run_id>/report.json` pribudne `sqlFieldParity`:
- `activeProfilesChecked`, `comparableCurrentD1`, `exactFieldMatches`, `needsReview`.
- `issues.counts` podľa konkrétnej príčiny a maximálne 12 dotknutých interných ID na príčinu.
- Žiadne kontakty, popisy, obrázkové URL, názvy služieb ani súkromné hodnoty nie sú v reportovanom výstupe.

## Bezpečnosť
- Používa iba SQL `SELECT` a čítanie aktuálneho Notionu cez existujúci schválený workflow.
- Bez migrácie, zápisu do D1, prepnutia `STAGED` do `VERIFIED/SQL_ONLY` alebo odstránenia JSON.
- Nejde o kompletnú kontrolu všetkých editorových polí alebo partner/Notion runtime ciest.
- Výstup `safeToMarkVerified:false` a `safeToSwitchRuntime:false` je úmyselný; `exactFieldMatches` **nie je** povolenie na cutover.

## Po merge
GitHub Actions → Directory SQL step 3 of 4 (reconciliation) → `mode=audit`, potvrdenie `AUDIT-DIRECTORY-SQL-STEP3-psipedia-sk-db`.

Až po vyhodnotení reálneho reportu pripravíme posledný runtime cutover a oddelené čistenie JSON v kroku 4/4.
