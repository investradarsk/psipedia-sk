# Psipedia.sk – Plemená 3/6: SQL/JSON zápisové cesty

**Stav: implementácia v PR #1460; produkčný dual-write sa NESMIE považovať za zapnutý.**

## Potvrdené predpoklady

- Manuálna produkčná schema-only 0174: GitHub Actions #44611472194, `POSTFLIGHT installedAfter=true`.
- 344/344 kontrolovaných Notion zrkadiel: #44601495993.
- 5/5 bezpečných SQL backfill statementov: #44613223144, `postflight-success`, `publicCutover=false`.
- Staré `managed_breeds.*_json` sa naďalej používajú pri verejnom čítaní a NIE JE možné ich odstrániť.

## Atómové zapisovanie

Aktivačný prepínač vo `wrangler.jsonc`: `BREED_SQL_V2_WRITE_MODE="off"`.
**Iba presný reťazec `shadow`** aktivuje nové D1 zápisy. Iná hodnota používa staré cesty.

1. **Notion webhook a Admin dirty field** volajú existujúcu jednopolovú legacy CAS aktualizáciu, za ktorou v *tom istom* `D1.batch` nasleduje validácia `changes()=1` a zápis do presného SQL v2 stĺpca. Pri neúspešnom druhom zápise sa rollbackne aj prvý.
2. **Admin whole save a staršie Notion full-profile adaptery** používajú rovnaký CAS strážca ako dnes; v transakcii sa aktualizujú všetkých 33 FCI, 11 redakčných, 8 SEO a usporiadané `breed_related_breeds`. Nepoužívame druhú asynchrónnu SQL dávku po uloženom JSON.
3. **Nové plemeno:** prvé INSERT a SQL v2 mirror sú v jednom `D1.batch`, identifikátor určuje výhradne UNIQUE slug (nie zadaný FCI); zlyhanie cudzieho kľúča rollbackne celé vytvorenie. Súvisiace články/služby majú naďalej existujúci následný autoritatívny writer.
4. **12 Notion kontrolovaných polí:** revízia D1 sidecar + parent `managed_breeds.updated_at` CAS + menené SQL facts/selects sú jedna transakcia. Parent verzia zabezpečuje, že stará celoprofilová Admin forma nemôže následne prepísať newer select. Select `null` nevymaže historickú ne-null klasifikáciu (FCI group/section/size); číselné `null` sú dovolené a čistia príslušný SQL fakt. Nezmenené súrodenecké polia sa neprepisujú.
5. **Notion writeback** má existujúce pending/retry správanie – PATCH Notionu nie je možné zaradiť do D1 transakcie, preto sa nesmie vydávať za distribuovanú ACID transakciu.

## Aktivácia (až po úspešnom PR CI)

- V produkcii preveriť posledný stav SQL tabuliek a porovnanie so starými JSON – kontrola `BREED_SQL_V2_CUTOVER_AUDIT_SQL` a zhodná aktívna Notion stránka.
- Overiť `BREED_SQL_V2_WRITE_MODE=off` po merge PR #1460.
- Osobitným schváleným deployom nastaviť `BREED_SQL_V2_WRITE_MODE=shadow`. To nie je public SQL cutover.
- Zmeniť skúšobne jedno textové pole z Adminu, jedno z Notionu a jeden kontrolovaný numerický/select fakt; potvrdiť správne SQL aj starý JSON + výsledok Notion PATCH, nulové parity-diffy. Overiť explicitný prázdny text, `false`, `0`, `null` a concurrent stale CAS.
- Pri chybe okamžite zastaviť pokusy o vytvorenie ďalších rozdielov, vypnúť shadow a vykonať read-only audit/paritu. Po vypnutí flagu môže legacy JSON naďalej prijímať zápisy bez SQL; pred opätovnou aktiváciou treba znovu porovnať a bezpečne zosúladiť nové hodnoty, nie bezhlavo opakovať jednorazový backfill.
- **Krok 3/6 je dokončený až po úspešnom produkčnom shadow teste všetkých 3 ciest.**

## Nie je súčasťou PR #1460

- Nezapína SQL-primary verejné čítanie: patrí do **4/6**.
- Nemaže `fci_standard_json`, `editorial_json`, `seo_json` a `related_breeds_json`: až **6/6** po funkčnom a SEO audite.
- Nevynucuje nový cloud provider ani generické opakovanie migrácií 0171–0174.
