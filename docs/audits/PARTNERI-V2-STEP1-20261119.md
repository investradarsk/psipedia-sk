# Psipedia.sk – Partneri V2, krok 1/8: audit a implementačný kontrakt

Dátum: 19. 11. 2026
Rozsah: iba Admin → Partneri a prihlásená partnerská časť. Ostatné sekcie Adminu zostávajú zachované.
Základ: aktuálny main repozitára investradarsk/psipedia-sk a 36 potvrdených funkčných rozhodnutí prevádzkovateľa.

## Účel

Nezakladať nový partnerský backend, druhú kanonickú databázu ani duplicitné redakčné editory. Reorganizovať existujúce účty, vlastníctvo, moderáciu a SQL zápisy do jednej používateľsky zrozumiteľnej administrácie; doplniť chýbajúce workflow a súkromné správy. Tento krok je iba zdokumentovaný audit, bez zmeny runtime, schémy alebo produkčných dát.

## Overená inventúra v main

| Časť | Súčasný zdroj | Verdikt |
| --- | --- | --- |
| Tabuľka partnerov | app/admin/partners/page.tsx, lib/partner-admin-store.ts | PRESTAVAŤ UI. Dnes osem metrík, osem samostatných frontov, účty s e-mailom, stavom, overením a počtom prístupov. |
| Detail účtu | app/admin/partners/accounts/[id]/page.tsx, getPartnerAccountAdmin | ROZŠÍRIŤ. Dnes kontakty, prihlásenia, membershipy a audit účtu, nie jednotná história všetkých podaní. |
| Prevzatie existujúceho profilu | lib/partner-claims-admin.ts, app/admin/partners/claims/[id]/page.tsx | PONECHAŤ doménovú logiku a pravidlo jedného vlastníka; rozhodovanie integrovať do kanonického editora a partnerovho detailu. |
| Nové služby/organizácie | lib/partner-new-profile.ts, lib/partner-new-profile-admin.ts, app/admin/partners/submissions/[id]/page.tsx | ZMENIŤ lifecycle. Dnes partner odosiela moderation_submissions a kanonický D1 profil vzniká až v createPartnerNewProfileAdmin, spravidla ako draft. Samostatná detailná stránka ukazuje polia v prehľade namiesto bežného editora. |
| Nové podujatia | lib/partner-events.ts, lib/partner-events-admin.ts, app/admin/partners/events/[id]/page.tsx | ZJEDNOTIŤ rovnakým lifecycle a editorom; samostatná moderácia má technické stavy/flagy. |
| Pomoc psom | lib/partner-help-create.ts, lib/partner-help-create-admin.ts, lib/partner-help-editor.ts | PONECHAŤ kanonické D1 tabuľky a schválené priame editory; presunúť koncepčné rozhodovanie do existujúcich Admin editorov. |
| Schválené priame úpravy | lib/partner-direct-profile.ts, lib/partner-direct-event.ts, lib/partner-help-editor.ts | PONECHAŤ writer a autorizáciu OWNER / verziu zápisu. Dnes zápis ide do kanonických SQL záznamov bez ďalšej moderácie. |
| Nová partnerská obrazovka | app/partner/page.tsx a app/partner/ziadosti/page.tsx | ZJEDNODUŠIŤ. Funkčné odkazy a rôzne zoznamy už sú; UI je rozdelené podľa technických typov. |
| Upozornenia | lib/partner-attention.ts, partner_notification_outbox v db/partner-schema.ts | DOPLNIŤ agregáciu podľa partnera, notifikáciu na každú priamu úpravu, používateľské preferencie kanálov a neprečítané správy. Existujúci outbox neslúži automaticky ako in-app inbox. |
| Chat | v auditovaných route, profile a schema súboroch sa nenašiel kompletný partnerský chat | DOPLNIŤ jednu bezpečnú konverzáciu na accountId, D1 ukladanie, prílohy cez existujúci private-media pipeline; open-source React chat iba ako prezentačný komponent. |
| História | partner_audit_events, moderation_events | ROZŠÍRIŤ. Priame write eventy zaznamenávajú hlavne názvy zmenených polí a revíziu; nepreukazujú úplné pôvodné/nové hodnoty, ktoré chce vlastník. |
| Notion/Odkontrolované | lib/partner-admin-store.ts, lib/partner-directory-review.ts, lib/admin-notion-review-lock.ts, docs/PARTNER-SELF-SERVICE-STEP8.md | REUSE. Trvalý review-lock nesmie odobrať odvolanie partnera. Overiť aktuálnu 0173 SQL projekciu a všetky agendy; žiadny druhý sync engine. |

## Potvrdené UX / funkčné správanie

### Admin – hlavná stránka

- Hlavná obrazovka: registrovaní partneri, nie zoznam technických frontov.
- Šesť stĺpcov: **Partner | E-mail | Žiadosti | Profily | Správy | Otvoriť**; žiadosti = aktuálne na rozhodnutie, správy = neprečítané od daného partnera; profily = aktívne spravované záznamy.
- Účet bez podania musí mať explicitné „Zatiaľ nepodal žiadnu žiadosť“. Nulové počty neprezentovať ako technickú chybu.
- Detail partnera: základné údaje a počty hore, záložky **Žiadosti / Profily / Správy / Účet / História**.
- Pri každej žiadosti ukázať typ, názov, stav a dátum, priamy odkaz na pôvodný kanonický editor; žiadne druhé formuláre moderácie.
- Upozornenia iba v Admine: nová žiadosť, každá priama úprava schváleného profilu, nová správa. Celková značka v menu Partneri, pri partnerovi jeho neprečítané správy a čakajúce žiadosti.
- Ručné priradenie existujúceho záznamu partnerovi bez žiadosti; konflikt s aktuálnym OWNER vždy vyžaduje explicitné rozhodnutie, nikdy tichý takeover.

### Životný cyklus nového záznamu

1. Po prihlásení partner vytvorí nový záznam v ľubovoľnej podporovanej agende. Kompletné verejné polia rovnaké ako v Admin editore, bez SEO/interných systémových polí, bez ďalších povinných obsahových polí; iba typ/kategória je potrebná na smerovanie.
2. Môže opakovane kliknúť na **Uložiť koncept**, pokračovať neskôr a otvoriť neverejný náhľad. Neverejný koncept vzniká v jedinom kanonickom D1 zázname a je viditeľný aj v bežnom Admin zozname ako „Partnerský koncept“; partnerovo súkromné rozpracovanie sa nesmie zobraziť v čakajúcom inboxe pred odoslaním.
3. **Odoslať na schválenie** urobí jednu čakajúcu žiadosť previazanú na ten istý kanonický draft. Partner smie naďalej meniť záznam aj počas review, ale **nesmie stiahnuť odoslanú žiadosť**. Súbehy Admin/Partner riešiť revíziou; bez tichého prepísania.
4. V bežnom Admin editore: **Schváliť + zverejniť + priradiť OWNER + Odkontrolované + Notion lock** v jednom konzistentnom kroku, alebo **Vrátiť na doplnenie** s dôvodom v žiadosti, alebo **Zamietnuť**. Vrátený koncept partner opraví a odošle znova.
5. Po prvom schválení ďalšie povolené verejné zmeny idú priamo do D1 a na už publikovaný web. Partner používa tlačidlo **Uložiť**, ochranu neuložených zmien, rovnaké limity médií ako Admin a podporu sekundárnych kategórií. Neobnovovať per-edit moderáciu.
6. Publikačný stav, SEO, vlastnícke oprávnenia a interné polia zostávajú pod Adminom; partner ich nesmie zapisovať ani cez API.

### Prevzatie a správa

- Existujúci profil sa neklonuje. Claim otvorí pôvodný Admin editor, schválením sa pridelí OWNER, označí Odkontrolované a zamkne Notion ↔ D1.
- Jeden profil najviac jeden aktívny partnerský OWNER; jeden účet môže spravovať neobmedzený počet rôznych profilov.
- Prípadné žiadosti o už obsadený profil prijať, zobraziť existujúceho správcu, presun schváliť a vykonať iba ručne.
- Odobratie správy ponechá záznam zverejnený, review lock aj dáta; pri archivácii profilu sa prístup odoberie/pozastaví natrvalo a po obnovení sa prideľuje iba novým schválením.
- Partner môže požiadať o archiváciu (nie fyzické DELETE), o dočasné skrytie, o vzdanie sa správy alebo o zrušenie účtu. Všetky tieto kroky rozhoduje Admin.
- Schválenie zrušenia účtu deaktivuje účet, uzavrie jeho aktívne žiadosti, odoberie správu, verejné profily ponechá; review lock zostáva.
- Pozastavenie celého účtu blokuje partner API a sessions, ale oprávnenia nezmaže; reaktivácia ich obnoví.

### História, notifikácie, komunikácia

- Audit každej partnerskej úpravy: kedy/kto/záznam/pole, **predchádzajúca aj nová hodnota**, vrátane pridania/odstránenia média; iba čítanie, bez tlačidla rollback. Neukladať heslá, tokeny, súkromné tajomstvá alebo SEO secret.
- Jeden súkromný chat **na partnera**, nie vlákno na každú žiadosť. Admin a daný partner, históriu aj prílohy vidia len oprávnené identity. Neprenášať citlivé dáta do tretej chatovej služby.
- Partner má predvolene zapnuté upozornenia **v účte + e-mailom**, s dvoma jednoduchými prepínačmi kanálov; žiadne voľby podľa typu udalosti. Správy/rozhodnutia zostávajú v histórii aj pri vypnutých upozorneniach.
- Admin dostáva upozornenia iba v Admin UI; každú priamu úpravu schváleného profilu zaznamenať/oznámiť, no nikdy ju neblokovať review.
- Partnerská úvodná stránka: Moje profily, vytvoriť nový, požiadať o správu existujúceho, koncepty, čakajúce žiadosti a spoločné správy.

## Konkrétne rozdiely oproti dnešnému main (nesmú sa preskočiť)

1. **Nový kanonický profil pred schválením** dnes chýba: lib/partner-new-profile.ts vytvára moderation_submissions so subject_id=NULL; lib/partner-new-profile-admin.ts až pri approval robí INSERT do directory_profiles/help_organizations. Podujatia a Help sú analogické. V2 musí zachovať link submission ↔ canonical draft a pri návratoch neklonovať ďalšie záznamy.
2. **Povinné polia** v lib/partner-new-profile.ts / components/partner-new-profile-form.tsx: názov, excerpt, lokalita, adresa, kontakt. V2 musí rozlišovať len technický typ od nepovinných verejných údajov; pozor na SQL NOT NULL, bezpečné interné defaulty a nenarúšanie unikátnych slugov.
3. **Approval dnes vytvára draft namiesto publikovania**: lib/partner-new-profile-admin.ts status:'draft'; obdobne event/help Create postup. V2 vyžaduje atómové „schváliť a zverejniť“. Pred zmenou overiť kľúče statusov každej kanonickej agendy.
4. **Chýba návrat na doplnenie** s dôvodom + opakované odoslanie na tom istom ID. Foundation moderácia má SUBMITTED/PENDING_REVIEW/QUARANTINED/APPROVED/REJECTED/WITHDRAWN; nový stav naplánovať kompatibilne, neprepisovať historické udalosti.
5. **Počas čakania** dnes nebola v auditovaných create-flow identifikovaná podporovaná úprava kanonického draftu tým istým partnerom. Chrániť optimistic concurrency.
6. **Nedostatočný detail partnera**: lib/partner-admin-store.ts getPartnerAccountAdmin nečíta claims, submissions ani event/help podania. Vyrobiť serverový account-centric agregátor aj pre staré registračné/claim záznamy bez backfillu.
7. **Legacy moderované zmeny** stále existujú v /admin/partners/changes a /partner/ziadosti. Historické záznamy ponechať čitateľné; nové schválené OWNER úpravy nesmú vytvárať ďalšie moderované podania.
8. **Audit priamych writerov** (lib/partner-direct-profile.ts, lib/partner-direct-event.ts, lib/partner-help-editor.ts) zaznamenáva keys/revision; pre pred/po hodnoty treba konzistentný transakčný snapshot alebo explicitný diff. Média, audit, SQL shadow, category mirrors a zmena samotného riadku musia byť konzistentné.
9. **Upozornenia**: lib/partner-attention.ts má len agregáty podľa typu, nie podľa accountId; lib/partner-new-profile.ts enqueuje existujúce admin notifikácie, ale nový prehľad potrebuje jednotné per-account čítače. Nie každá direct-save má admin upozornenie.
10. **Chat a prefs**: nedoložená existujúca súkromná chatová D1 schéma ani dve kanálové preferencie; až po overení aktuálnej fyzickej schémy navrhnúť minimálnu aditívnu migráciu, nevyberať číslo od stola.
11. **Anti-self-approval**: lib/partner-ownership-approval.ts dnes zablokuje admina prihláseného pod rovnakým partnerským e-mailom. V aktuálnom produkčnom testovaní sa používa odlišný účet. Toto nie je samoúčelný blocker kroku 2; ak neskôr budeme povoľovať vlastné žiadosti hlavného administrátora, musí to byť explicitne oddelené bezpečnostné pravidlo.
12. **Help SQL cutover** je paralelný projekt v samostatnom draft PR #1463. Partneri nesmú prepisovať Help schémy/backfill ani odstraňovať legacy cesty bez ich samostatnej parity. **0171 a 0172 už boli vykonané v produkcii; nikdy znovu nespúšťať.** Migrácie 0173+ má iný paralelný projekt; neobsadzovať ich čísla bez aktuálneho inventára.

## Dátová architektúra (cieľ)

- Jediná kanonická databáza Cloudflare D1 pre redakčné entity, účty, vlastníctvo, odoslané návrhy, audit, per-account počty, notifikácie a chat.
- Existujúce partner_accounts, partner_account_profiles, partner_resources, partner_memberships, partner_claims, partner_help_claims, moderation_submissions/metadata, moderation_events, partner_audit_events sa migrujú iba aditívne, so zachovaním ID a histórie.
- **Jeden kanonický profil** viditeľný z Admin editorov, partner editorov aj verejného webu. Žiadosť je samostatná informácia o workflow, nie druhá publikovateľná kópia.
- Pre každý typ vypracovať mapu: route na existujúci kanonický Admin editor + status draft/public/archived + review-lock + owner eligibility + povolené verejné polia. Pri každom zápise zachovať CAS, SQL first, redakčnú Notion ochranu a cache invalidáciu.
- Žiadne auto-restore Notion zámkov pri odobratí prístupu alebo deaktivácii účtu. Audit nerobiť z PII exportu.
- Pre chat použiť open-source **UI komponenty**, nie nový server s vlastným PostgreSQL. Overiť licenciu konkrétnej verzie pred pridaním závislosti; režim bez real-time websocketov je akceptovateľný.

## Vykonávací plán (2 PR, 8 krokov)

**Draft PR 1 (kroky 1–5):**
1. Audit a technický kontrakt (tento dokument, žiadne runtime zmeny).
2. Tabuľka Partneri so šiestimi stĺpcami, reálnymi per-account počtami, bezpečnou pagináciou, filtrami, menu badge.
3. Kompletný detail partnera, záložky, história, jednotný inbox a prepojenie na existujúce editorové URL.
4. Kanonický draft pred odoslaním, editácia počas review, vrátenie s dôvodom, opätovné odoslanie, schválenie+publikácia+OWNER+Notion lock. Aditívna schéma iba ak ju neobsahuje existujúca D1.
5. Priame post-approval práva, ručné priradenia, archivácia/skrytie/vzdanie/zrušenie účtu, detailný old/new audit a admin notifikácie každej úpravy.

**PR 2 (kroky 6–8):**
6. Plná partnerská UX: rovnaké verejné polia/médiá/kategórie, autosave nevytvárať, tlačidlo Uložiť, unsaved guard, súkromný preview, rozpracované koncepty.
7. Jedna konverzácia na partnera, prílohy, unread stav, dva notifikačné kanály (default ON), admin bez e-mailov.
8. Regresné testy a e2e celéj cesty, zjednotenie zastaraných obrazoviek/odkazov bez zmazania histórie, chránený rollout.

## Akceptačné kontroly pred merge/deploy

- Historický partner bez podaní: viditeľné nuly a „Zatiaľ nepodal žiadosť“; podaný claim/create/help/event: správny partner a počítadlo, bez zobrazenia cudzej PII.
- Partnerov súkromný koncept nepublikovaný, v kanonickom Admin zozname, nie v čakajúcom inboxe; po odoslaní jednu žiadosť; editácia nemení owner/status ani nevytvára duplicitu.
- Admin v kanonickom editore: approve publikuje a priraďuje OWNER + review lock; return s dôvodom nechá stav neverejný; reject nezverejňuje.
- Neskorší edit po approval: hneď v SQL/web, bez moderácie, s alertom pre Admin a presným pred/po auditom; zachová cudzie/nezmenené polia.
- Človek s odobratým prístupom, pozastavený účet, partner s cudzou konverzáciou: 403 aj pri priamom API volaní.
- Archív nie je DELETE; obnovenie nedáva staré práva. Revoke/transfer nezmaže obsah ani review-lock. Viacerí OWNER na jednom zázname sú odmietnutí.
- Notion review-lock funguje obojsmerne, aj po revoke; pri súbežných edits neprepíše verified hodnotu, kontrolovať projekcie 0173 podľa nasadenia.
- Testovať Služby (vrátane chovateľských staníc, sekundárnych kategórií, galérií), Podujatia, Organizácie, Adopcie, Stratené/nájdené a ostatnú Pomoc psom.
- Rollout musí zvlášť overiť produkčnú schému, zálohu a kompatibilitu s paralelnými SQL/Notion PR; 0171/0172 NESPÚŠŤAŤ; automatický generický migration replay nepoužiť.
- Pred merge znovu potvrdiť HEAD, lint, build, partner testy, migrácie, e2e a produkčné dáta. Zelená dokumentácia ani draft PR nie sú dôkaz produkčného QA.

## Stav 1/8

- Audit zdrojového kódu a kontrakt hotový.
- Žiadne súbory produkčného runtime, migrácie, D1 ani Notion dáta sa nemenia.
- Nasleduje **2/8: tabulka Registrovaní partneri**, na tejto istej draft PR vetve.
