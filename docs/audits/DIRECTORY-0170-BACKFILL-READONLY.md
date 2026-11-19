# Directory 0170 – read-only inventory pred prenosom hodnôt

**Rozsah:** Adresár (10 kategórií), produkčná D1, schéma 0170. Nadväzuje na overený
`POSTFLIGHT, installed=true, applied=true, profiles=1845` z runu
[44351646340](https://github.com/investradarsk/psipedia-sk/actions/runs/44351646340).

## Čo workflow skutočne robí

- Manuálne na `main`, chránené environment `production`; PR spúšťa iba lokálne unit testy.
- Každý profil číta cez keyset stránkovanie (`id > posledné_id`), s kontrolou
  presného počtu, maxima ID, súčtu ID, dĺžky JSON a posledného `updated_at` pred/po.
- Overí fyzickú prítomnosť kontaktov a troch relačných tabuliek 0170.
- Porovnáva **všetkých 5 kontaktov** voči SQL (`website_url`, `public_phone`,
  `public_email`, `facebook_url`, `instagram_url`), vrátane historických aliasov
  `Web` a `Webstránka`, druhé kategórie, vybrané redakčné fakty,
  21 konkrétnych filtrov a hodnoty už prítomné v SQL.
- `issuesByCategory` eviduje agregované typy rozdielov osobitne pre každú
  kategóriu; globálne `issues` a vzorky ID zostávajú zachované.
- Prvý prázdny historický alias nezakryje druhý vyplnený alias.
  Web existujúci iba v kanonickom SQL sa **nepovažuje za problém**.
- Eviduje pokrytie mapovaní `directory_notion_sync` (len či väzba existuje),
  profily označené `Odkontrolované` a archivované profily.
- Vydá iba agregované počty a najviac 12 D1 ID pre triedu problému.
  Kontaktné hodnoty, celé JSON, Notion page ID a osobné adresy nikdy nevypisuje.
- Povoľuje iba `SELECT`; nepripojuje sa k Notion API; žiadny zápis do D1,
  webhook, `migrations apply`, zmena Admin/public čítania, DELETE ani backfill.

## Čo výstup **NEPOTVRDZUJE**

- Samotné mapovanie na Notion **nie je** overenie aktuálnej Notion hodnoty.
- `directory_profiles.updated_at` ani `directory_notion_sync.last_synced_at`
  nedokazujú čas poslednej zmeny **konkrétneho poľa**.
- `website_url = ''` pri historických profiloch samo o sebe nedokazuje, kedy
  a kto web vymazal. Hlásenie `explicit_clear_vs_legacy` preto označuje
  **rozpor na ručné overenie**, nie rozhodnutie o poslednom platnom zápise.
- `legacy_only_unverified` **nie je bezpečný kandidát na automatické kopírovanie**.
  Vyžaduje dôkaz z per-field verzie/zmenovej histórie alebo ručný súhlas.
- `stableAggregates=true` iba zachytáva rovnaké kontrolné agregáty na začiatku a
  konci. Nie je to transakčný snapshot ani dôkaz, že medzi čítaniami nedošlo k editácii.
- Kategóriové fakty sa kontrolujú podľa konzervatívneho súboru známých štítkov;
  úplný aktuálny Notion field registry a hodnoty nie sú overované naživo.
- Historicky zmazané profily/organizácie sa neobnovujú; chýbajúci Notion profil
  sa neskúša vytvoriť a `Odkontrolované` ostáva nedotknuté.

## Po merge – samostatný owner krok

[Directory 0170 – read-only backfill inventory](https://github.com/investradarsk/psipedia-sk/actions/workflows/directory-0170-backfill-readonly.yml)
→ `Run workflow` → `main` → potvrdenie:
`AUDIT-0170-BACKFILL-psipedia-sk-db`.

Vykonanie vytvorí súkromný artifact `report.json` na 30 dní.
Očakávané: `phase=READ_ONLY_BACKFILL_AUDIT`, `readOnly=true`,
`baselineProfiles=endProfiles=scanned`, `stableAggregates=true`.
Ak sa počet alebo kontrolné agregáty zmenili, run skončí chybou a audit sa musí
opakovať. Nesnažiť sa "opraviť" čísla ručným SQL prenosom.

## Ďalší krok (samostatné PR a samostatné schválenie)

Zhodnotiť počty a vybrané ID, doplniť preukázateľné časové metadáta pre jednotlivé
polia a kontrolu aktuálneho Notion obsahu. Až potom navrhnúť znovuspustiteľný
a transakčne chránený backfill s per-field last-write-wins a explicitnými
prázdnymi hodnotami. Starý JSON sa nesmie zmazať pri tomto kroku.
