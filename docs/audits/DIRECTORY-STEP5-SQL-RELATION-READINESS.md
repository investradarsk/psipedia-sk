# Adresár – krok 5/8: spoločný dôkaz pripravenosti SQL relácií (read-only)

V novembri 2026 sú v produkčnej Cloudflare D1 už vytvorené tabuľky pre:
- vedľajšie kategórie (`directory_profile_additional_categories`),
- verejné redakčné fakty (`directory_profile_public_facts`),
- kategóriové filtre (`directory_profile_filter_values`),
- Services V3 výbery (`service_profile_option_choices`),
- verifikovanú Notion reláciu Services V3 (`directory_service_notion_relation_sync`).

Nová SQL migrácia by bola duplicitná. Tento PR rozširuje **už existujúci** chránený produkčný audit `directory-0170-backfill-readonly.yml`, nie ďalší workflow.

## Čo nový audit vyhodnotí

1. Zhodu legacy redakčných hodnôt a SQL projekcií pre všetkých 10 kategórií, vrátane vedľajších kategórií.
2. Osobitne `_psipedia_additional_categories_sql_confirmed = '1'`: rovnaké historické a SQL `[]` **nie sú potvrdením**, že bolo SQL členstvo vôbec prevedené. Explicitné potvrdenie aj prázdneho zoznamu musí byť rozlíšiteľné.
3. V3 `yes/no` výbery podľa stabilného `option_id` a verzie; chybný alebo zdvojený zoznam označí na kontrolu. **Staré voľné texty v poli „Služby“ sa nepovažujú za ekvivalent V3.**
4. Existujúci Notion baseline `confirmed_ids_json`: neexistujúca evidencia pri kladných výberoch, rozdielne IDs a nesúlad Notion page ID sú samostatné **kontrolné prípady**, nie dôvod automaticky prepísať jedno úložisko druhým. Pri úmyselne odkontrolovaných či partnerom spravovaných profiloch môže byť Notion baseline zastaraný legitímne.
5. Kontrolu konzistencie počas stránkovaného auditu aj nad relačnými tabuľkami. Services V3 voľba sa môže zmeniť bez zmeny `directory_profiles.updated_at`; pri takej zmene audit nesmie vyhlásiť agregáty za stabilné.

## Súčasný limit

- Audit je **iba SELECT**, bez D1/Notion zápisu, bez per-field migrácie a bez zmeny verejného webu.
- Výsledok sumarizuje iba typy chýb, kategórie, počty a úzko obmedzené ID vzorky. Neukladá hodnoty telefónov, e-mailov, adries, historického JSON ani súkromné poznámky.
- Potvrdená synchronizácia Notion baseline nie je dôkaz, že dnešné živé hodnoty v Notione stále súhlasia.
- Tento PR uzatvára **auditnú časť kroku 5/8**, nie automatický SQL-only cutover. Pred krokom 7 treba vyriešiť každé oprávnené rozdielne či nemigrované pole z dátového inventára a zjednotiť zápis podľa kroku 6.

## Manuálna kontrola po merge

V GitHub Actions spusti doterajší `Directory 0170 – read-only backfill inventory`, s potvrdením `AUDIT-0170-BACKFILL-psipedia-sk-db`. Neexistuje nový production workflow ani SQL migrácia.

Očakávané reportové kľúče:
- `issuesByCategory`, `issues`, `sampleProfileIds`,
- `v3CanonicalSqlAudited: true`,
- `v3AndRelationalSnapshotStable: true` iba pri stabilnom súbehu,
- `transferApproved: false` a `notionLiveVerified: false` vždy.

**Nemergovať PR #1448 ani neodstraňovať JSON na základe tohto samotného inventára.**
