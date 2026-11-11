# D1 0165 – verejné kontakty stratených/nájdených psov

## Účel a rozsah

Migrácia `drizzle/0165_lost_found_public_contacts.sql` pridá do existujúcej
`lost_found_dog_reports` presne päť stĺpcov:

| Stĺpec | Typ | Predvolená hodnota |
|---|---|---|
| `public_phone` | `TEXT NOT NULL` | prázdny text |
| `public_email` | `TEXT NOT NULL` | prázdny text |
| `public_website_url` | `TEXT NOT NULL` | prázdny text |
| `public_facebook_url` | `TEXT NOT NULL` | prázdny text |
| `public_instagram_url` | `TEXT NOT NULL` | prázdny text |

Súkromné šifrované údaje oznamovateľa zostávajú výhradne v
`lost_found_dog_private_details`. Migrácia **nekopíruje**, neodtajňuje a
nevyplňuje žiadne kontakty z tejto tabuľky. Neovplyvňuje adopcie ani plemená.
Bez schválenia kontaktov editorom ostanú verejné polia prázdne.

## Pripravený kontrolovaný rollout

Iba GitHub Actions workflow
[Production D1 0165 Public Contacts (manual)](https://github.com/investradarsk/psipedia-sk/actions/workflows/production-d1-0165-contacts.yml)
umožňuje nezávisle spustiť **audit** alebo po samostatnom rozhodnutí **apply**.

- Žiadny automatický trigger pri merge, push, CI ani deployi.
- Iba `main`, manuálny `workflow_dispatch`, protected GitHub environment
  `production` a secret `CLOUDFLARE_D1_API_TOKEN`.
- Pred spustením sa kontroluje aktuálny `main`, kanonické Cloudflare
  account/D1 ID, Git blob SHA a presné znenie piatich `ALTER TABLE` príkazov.
- Spoločná zámka `production-d1-migration` bráni súčasným schváleným D1 migráciám.
- Audit kontroluje reálnu schému zdrojovej aj súkromnej tabuľky (bez čítania
  súkromných údajov), počty záznamov a stav piatich nových stĺpcov.
- Ak existuje iba časť stĺpcov alebo nekompatibilná definícia, program
  odmietne ďalší APPLY. Ak sú už všetky správne, APPLY je no-op.
- Pred každým zápisom vznikne D1 Time Travel recovery bookmark, ktorý sa
  uloží do `.production-d1-0165/report.json` a 30-dňového CI artefaktu.
- Po zápise sa overí úplná schéma a počty záznamov zdrojovej aj súkromnej
  tabuľky a počet záznamov `d1_migrations`. Výsledok je `POSTFLIGHT`.
- **Bez automatického zápisu do `d1_migrations`.** Migrácia 0165 zostáva
  mimo generickej sekvenčnej APPLY allowlist, kým neprebehne samostatná
  analýza stavu 0158–0164 a migráčnej evidencie.
- PRI `FAILED`, najmä pri čiastočnej schéme, neklikaj APPLY znovu; najprv
  skontroluj artefakt a recovery bookmark. Nikdy neaplikuj ďalšie ALTER naslepo.

## Kroky pre správcu po zlúčení PR #1316

1. Na GitHube otvor [workflow 0165](https://github.com/investradarsk/psipedia-sk/actions/workflows/production-d1-0165-contacts.yml).
2. Klikni **Run workflow**, vetva **main**, režim **audit**.
3. Zadaj potvrdenie `AUDIT-0165-psipedia-sk-db`.
4. V artefakte skontroluj `phase=AUDIT` a `state.readyToApply=true`.
   Ak je `state.installed=true`, fyzická migrácia už existuje – nič nespúšťaj.
   Pri chybe, čiastočnej schéme alebo pri nedostupnom audite STOP.
5. Až po úspešnom audite a samostatnom schválení databázovej zmeny zvoľ
   `apply`, s potvrdením `APPLY-0165-psipedia-sk-db`.
6. Vyžaduj `phase=POSTFLIGHT`, `applied=true`, `installed=true`,
   `migrationHistoryRecorded=false` a nezmenené počty záznamov.
7. Otvor v Admine **Stratené a nájdené psy**, v jednom známom profile
   vyplň iba **schválený verejný** telefón alebo e-mail, ulož a obnov.
   Na verejnom detaile over klikateľné `tel:` a `mailto:` v spoločnej
   karte a akčnom tlačidle. Over aj profil bez kontaktov.
8. Samostatne otestuj zmenu alebo vymazanie verejného kontaktu a uistenie,
   že súkromné kontakty oznamovateľa sa nikam automaticky neskopírovali.

## Nezamieňať s PR #1316

PR #1316 zároveň zjednocuje vizuálnu šablónu **adopcií** podľa stratených
a nájdených psov. Adopcie **nepotrebujú 0165**; ich kontaktné polia existovali
už pred týmto PR. `0165` je nezávislý produkčný databázový rollout
špecifický pre stratené/nájdené psy.

## Lokálna kontrola bez vzdialeného zápisu

```sh
node --test tests/production-d1-0165-contacts.test.mjs
node --test tests/lost-found-public-contacts.test.mjs
npm run db:check-migrations
```

Samotné zlúčenie PR nemení D1 a nie je dôkazom, že bola 0165 aplikovaná.
