# Psipedia.sk – Partneri V2, krok 5/8: práva, životný cyklus, audit a upozornenia

Dátum: 20. 11. 2026
Vetva: feat/partneri-v2-pr1-audit-and-admin-20261119
PR: #1467 **Draft** – nespájať a nenasadzovať.

## Rozsah zapracovaných zmien

### Žiadosti o zmenu viditeľnosti a oprávnení

V \`lib/partner-lifecycle.ts\` nový partnerský workflow používa existujúcu tabuľku \`moderation_submissions\`:

- \`REQUEST_HIDE\`: partner môže len požiadať o dočasné skrytie. Schválenie Adminom nastaví neverejný \`draft/DRAFT\`, ale nechá \`published_at\` pre budúce vedomé obnovenie Adminom; vlastníctvo ostáva.
- \`REQUEST_ARCHIVE\`: partner žiada odstránenie, Admin schválením **archivuje, nikdy nemaže** obsah D1. V tej istej transakcii odoberie aktívne členstvo alebo Help claim. Pri obnovení už nevznikne automatické obnovenie prístupu.
- \`REQUEST_RELEASE\`: Admin po schválení odoberie vlastníctvo, necháva obsah aj verejný stav profilu bez zmeny.
- \`REQUEST_DELETE_ACCOUNT\`: Admin schváli deaktiváciu účtu, zruší jeho sessions/tokens, odoberie aktívne členstvá/Help claims a uzavrie otvorené podania. Všetky už publikované profily ostávajú publikované a jeho staré dáta zostávajú v D1 pre redakčnú históriu.

Rovnaký cleanup pri priamej \`DEACTIVATE\` v pôvodnom Admin účte; pri \`SUSPEND\` sa členstvá **nikdy neodoberajú** a po reaktivácii sa obnoví prístup.

Pending podania sa uzatvárajú aj v \`partner_claims\`, \`partner_help_claims\`, \`partner_resource_verifications\`, nevybavených \`NEW\` komerčných záujmoch a \`OFFERED\` dohodách. Schválené komerčné dohody sa automaticky nemažú.

Žiadosti vytvára Partner v \`/api/partner/lifecycle\`, spracúva chránené Admin API \`/api/admin/partners/lifecycle/[id]\`. Ich rozhodnutia sa zobrazujú v originálnom Admin detaili osoby, nie v oddelenej DB. API je chránené autentifikáciou, same-origin kontrolou na Partner strane, allowlistom akcií a SQL owner predicate + CAS guardom pri rozhodnutí. Už otvorenú rovnakú žiadosť nemožno opakovať.

### Partner a Admin UI

- Partner formulár je **až pod normálnym editorom** Adresára, Organizácie, Podujatí, Adopcií, Stratené/nájdené a Pomoc psom.
- Zrušenie účtu sa žiada v existujúcich Nastaveniach. Žiadosti a ich stavy sú v existujúcej záložke Žiadosti.
- Admin Partneri → detail osoby → Žiadosti: nové typy zobrazujú **Schváliť/Zamietnuť**, voliteľnú poznámku, odkaz na pôvodný editor, nie len technický stav. Počítajú sa v hlavných počítadlách.
- Existujúce staršie žiadosti o vytvorenie/prevzatie profilu zostali na pôvodných API; neprepisujú sa ich historické dáta.

### Detailný audit OLD/NEW

Tri priame verejné save cesty zapisujú \`partner_audit_events.metadata_json.changes\` s každým skutočne zmeneným poľom vo formáte \`{old,new}\`:

1. \`lib/partner-direct-profile.ts\`: služby a organizácie, vrátane hlavného obrázka a galérie cez povolené \`galleryUrls\`.
2. \`lib/partner-direct-event.ts\`: podujatia vrátane hlavnej fotografie.
3. \`lib/partner-help-editor.ts\`: Pomoc psom vrátane fotografií a galérie.

Metadata zaznamenávajú aktéra \`partner:{accountId}\`, čas a cieľové D1 ID; ukladajú len public-edit allowlist. Rozdiely sa zobrazujú:
- Admin Partneri → detail osoby → História.
- Existujúci konkrétny Admin editor všetkých šiestich agend (\`AdminPartnerCanonicalAudit\`).

**Audit je read-only; neexistuje automatický rollback/revert**, podľa rozhodnutia vlastníka projektu. Staršie udalosti bez \`changes\` zostávajú čitateľné bez vymýšľania pôvodných hodnôt.

### Upozornenia

Každé úspešné priame uloženie pridáva \`admin_notification_events\` do tej istej D1 batch transakcie ako kanonický UPDATE a audit. Event má vlastný unikátny \`dedupe_key\`. Po chybnom CAS sa všetko rollbackne (žiadna falošná notifikácia). Rovnaká infraštruktúra slúži na upozornenie pri novej lifecycle žiadosti.

\`lib/admin-automation-push-policy.ts\` klasifikuje priame úpravy cez existujúcu default-enabled kategóriu \`PROFILE_PROPOSAL\` a lifecycle cez \`PARTNER_REQUEST\`. **Nie je pridaná ďalšia Push kategória ani migrácia**. Email administrátorovi sa nevytvára.

### Žiadna nová migrácia

Používame existujúce TEXT operačné hodnoty v \`moderation_submissions\`, revokačné stĺpce v membership/Help claim a existujúcu tabuľku \`partner_audit_events\` s povolenými audit action hodnotami. Nad originálnym profilu D1 sa nerobí hard delete, nedotýkame sa manuálne produkčných údajov, nespúšťame 0171/0172/0173/0174 znovu.

## Testy/kontrakty pridané do PR

- \`tests/partner-v2-lifecycle-step5.test.mjs\`: public field diff, read-only audit, Same-Origin a auth API, stavový audit, archivácia bez hard delete, notice vložený do D1 batch.
- \`tests/partner-admin-dossier.test.mjs\`: account isolation, nové lifecycle žiadosti, pending počítadlá, canonical editor.
- \`tests/partner-admin-search.test.mjs\`: nová pending kategória v zozname účtov.
- \`tests/admin-automation-push.test.mjs\`: klasifikácia a preferencie Admin push kategórií.

## OTVORENÉ BLOKERY PRED MERGE / PRODUKCIOU

**Krok 5 je commitnutý, nie potvrdený produkčne.** Konkrétne:

1. Nespustené alebo nepotvrdené kompletné TypeScript lint/build/CI a D1 integračné testy. Nie je dôvod označiť PR ako \`Ready\`; Partner security workflow sa na Draft PR môže preskočiť.
2. Treba vykonať staging/test-D1 funkčný scenár každého typu: request, approve, reject, 409 pri stale owner, priebeh skrytia/re-publish, archivácia/revoke, bez Notion návratu, pending account cleanup, kontrola \`PRAGMA foreign_key_check\`.
3. Otestovať serializáciu starého/nového auditu vrátane obrázkov a kolízií v rámci \`batch\`, overiť či Admin notification feed aj mobilné push dostanú každú jednu uloženú zmenu.
4. Detailné OLD/NEW údaje pred prvým nasadením kroku 5 historicky neexistujú a **nedajú sa spätne spoľahlivo zrekonštruovať**.
5. Skrytie a archivácia po D1 commit volajú `invalidateVersionedPublicHtmlCacheUrl` na detail aj listing. Reálne zneplatnenie HTML cache treba potvrdiť na stagingu.
6. Pôvodné UI cesty a prvá generická forma pre \`4/8\` zatiaľ nemajú úplnú paritu public polí, médií a galérií – doplniť v kroku 6.
7. Budúci krok 8 musí prekryť súbežné zmeny \`main\` (súčasne prebiehajú Adresár/Pomoc psom SQL migrácie), overiť, že bežný Admin editor nemôže omylom zverejniť nevybavený partnerský CREATE mimo workflow a že invalidácia cache na verejnom webe pri skrytí/archivácii prebehne aj naozaj.
8. Pri schvaľovaní obsahových operácií z kapitoly 4 je stále potrebná skutočná integračná verifikácia transakcií, cache a Notion uzamknutia – nemergovať po samotnom kroku 5.

## Stav

**5/8 – zapracované do Draft PR #1467. Nezmergované, nenasadené.**
Nasleduje **6/8:** zjednotiť formuláre, všetky verejné polia a galérie, ukladanie a preview na mobile.
