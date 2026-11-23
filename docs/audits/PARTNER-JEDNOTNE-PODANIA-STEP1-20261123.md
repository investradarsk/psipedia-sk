# Psipedia.sk — jednotné podania cez Partner účet — audit 1/8

Dátum: 23. 11. 2026. Zdroj: priamo overené súbory hlavnej vetvy main pred založením pracovnej vetvy.
Stav: ANALÝZA. Tento krok nemení používateľské formuláre, autentifikáciu, údaje ani databázu.

## Schválený funkčný cieľ

Každý človek, ktorý vytvára **nový spravovateľný verejný profil** (stratený/nájdený pes, adopcia, ostatná pomoc psom, služba, organizácia, podujatie), používa Partner účet. Účet je určený aj súkromnej osobe, nie iba firme. Cieľ: po schválení správa vlastného profilu, komunikácia s redakciou a história podaní.

Obyčajné otázky, dopyty na služby, redakčné tipy a recenzie nie sú automaticky tvorbou verejného spravovateľného profilu; nepresúvať ich bez výslovného rozhodnutia.

## Súčasné vstupy a dátové cesty

| Oblasť | Verejný vstup / existujúca cesta | Zistený stav |
| --- | --- | --- |
| Stratený/nájdený pes | /pomoc-psom/stratene-a-najdene/nahlasit, banner a tlačidlá zo zoznamu | Anonymný komponent LostFoundSubmissionForm volá POST /api/lost-found/submissions. V D1 vzniká PENDING report a PUBLIC_REPORTER moderácia; odosielateľ nemá vlastníctvo Partner účtu. |
| Služba/organizácia | /partner/profily/novy -> /partner/koncepty/novy?typ=DIRECTORY_PROFILE; generický formulár vie tiež HELP_ORGANIZATION | Už vyžaduje Partner session a onboarding. |
| Podujatie | /partner/podujatia/nove -> /partner/koncepty/novy?typ=MANAGED_EVENT | Už vyžaduje Partner session a onboarding. |
| Adopcia, stratený/nájdený pes, pomoc psom | /partner/pomoc/nova -> /partner/koncepty/novy?typ=ADOPTION_DOG | Zdieľaný formulár podporuje aj LOST_FOUND_DOG a HELP_CASE. Nejde o verejné anonymné nahlasovanie. |
| Existujúci profil | /partner/prevziat | Pre všetkých šesť kategórií možno vyhľadať profil a požiadať o správu; nevzniká kópia profilu. |
| Všeobecný kontakt | /kontakt | Všeobecná otázka a spolupráca používajú mailto; nie sú to nové spravované profily. |
| Dopyt na službu | komponent directory-contact-form a /api/directory/inquiries | Samostatný návštevnícky dopyt, dnes /admin/dopyty; nemigrovať bez odlišného rozhodnutia. |
| Redakčný tip | /novinky/poslat-tip, /api/news-tips | Samostatné redakčné podanie; nemá vlastný verejný profil. |
| Pes v núdzi | /pomoc-psom/nahlasit-psa-v-nudzi | Informačný postup, nie formulár. |

## Čo sa už dá opätovne použiť

1. **Identita:** /partner/registracia, /partner/prihlasenie, /partner/onboarding a lib/partner-page-auth.ts. Podporované heslo, magic link, voliteľne Google; návrat cez validované returnTo v lib/partner-return-to.ts.
2. **Šesť typov konceptov:** lib/partner-canonical-workflow.ts a /api/partner/canonical-drafts. Reálne kanonické D1 riadky: directory_profiles, help_organizations, managed_events, adoption_dogs, lost_found_dog_reports, help_cases. Draft možno uložiť, upraviť a odoslať.
3. **Moderácia:** moderation_submissions + moderation_events, Admin rozhodnutie APPROVE / REJECT / RETURN. Pri kanonických partnerských konceptoch APPROVE prepína status na verejný a prideľuje OWNER cez partner_memberships alebo schválený partner_help_claims (podľa typu). Nemení druhú kópiu profilu.
4. **Následná úprava:** existujú partner priame editory s kontrolou oprávnení, SQL owner podmienkou, optimistickou revíziou a auditom. SEO, status publikácie, interné a súkromné polia nie sú bežné editable public fields.
5. **Prebratie už existujúceho záznamu:** /partner/prevziat a lib/partner-claims.ts / lib/partner-help-claims.ts; neudeľovať vlastníctvo iba na základe zhody voľne zadaného e-mailu.
6. **Komunikácia:** /partner/spravy, Admin Partner detail -> Správy, lib/partner-chat.ts, /api/partner/chat. Jedna privátna konverzácia na accountId; prílohy sú súkromné, e-mail len oznam o novej správe.
7. **Notifikácie:** Resend + existujúci partner_notification_outbox a cron sweep v lib/partner-email.ts; predvolené preferencie kanálov, retry, deduplikácia; chat má samostatnú malú frontu.

## Identifikované medzery a riziká

**P1 — Dva vstupy pre stratené/nájdené:** verejné tlačidlá na stránkach a zdieľaný banner stále vedú na anonymné nahlasovanie. Nestačí meniť text tlačidla: starý POST endpoint by zostal aktívny. Nový cieľ musí zachovať typ LOST/FOUND a po registrácii dostať používateľa priamo do správneho partnerského formulára; blokovať nové anonymné vytváranie až po plnom overení náhrady.

**P2 — Porovnanie údajov:** anonymný LostFoundSubmissionForm vyžaduje telefón alebo e-mail, vedie súkromnú kontaktnú osobu, dátum posledného videnia, popis, lokalitu a fotografiu; private PII šifruje do lost_found_dog_private_details. Generický Partner formulár má hlavne *verejné* polia vrátane public_email/public_phone a používa kontaktný profil účtu. Pri prechode sa súkromný kontakt nesmie zmeniť na verejný ani sa stratiť. Potrebné je mapovanie polí, povinností, uploadu a UX bez duplikácie zdrojových tabuliek.

**P3 — Životný cyklus:** partner-help-editor-fields.ts pre LOST_FOUND_DOG zámerne neobsahuje status; po zverejnení partner nemá jasnú bezpečnú akciu „Pes sa našiel / prípad je vyriešený“. Potrebný samostatný autorizovaný lifecycle prechod a kontrola správneho SEO/cache a Notion.

**P4 — Odoslanie a rozhodnutia:** submitPartnerCanonicalDraft v lib/partner-canonical-workflow.ts vytvorí Admin upozornenie, no nie partner receipt NEW_PROFILE_SUBMITTED / EVENT_SUBMITTED do partner_notification_outbox. APPROVE vytvorí NEW_PROFILE_CREATED / EVENT_CREATED, ale text v lib/partner-email.ts hovorí „vytvorený ako koncept“, kým kanonický workflow zmení status na publikovaný. Vetvy REJECT a RETURN neukladajú v tejto funkcii zodpovedajúci partner e-mail. Rozlíšiť administrátorské schválenie od skutočnej publikácie pri všetkých variantných vetvách; šablóny musia odpovedať konkrétnemu workflow, nie názvu eventu. Posielať presne raz pri stavovej zmene, nikdy pri obyčajnom SAVE.

**P5 — Admin roztrieštenosť:** /admin/partners, /admin/partners/canonical-drafts, /admin/stratene-najdene a /admin/dopyty sú rôzne obrazovky. /admin/partners/accounts/[id] už vie komunikovať s partnerom; jednotný prehľad musí ukázať podanie, partnera, kanonické ID, stav, históriu a link na editor bez kopírovania zdrojových riadkov. PR #1564 už do Adminu doplnil dohľadateľnosť pôvodu anonymného LOST/FOUND hlásenia; zachovať.

**P6 — Staré verejné hlásenia:** už schválené záznamy typu PUBLIC_REPORTER nemajú automaticky vlastníka Partner účtu. Nemažú sa ani sa neprevádzajú automaticky podľa zadanej e-mailovej adresy. Použiť overené prevzatie existujúceho profilu a zachovať súčasnú moderáciu, súkromné kontakty a históriu.

**P7 — D1/Notion a práva:** dodržať review-lock aktívneho Partner správcu, existujúce per-field konfliktové pravidlá a CAS. Nepridávať druhú kanonickú tabuľku ani druhý sync engine. Existujúce migrácie 0171, 0172, 0173, 0174 a 0175 nespušťať znova. Prípadné zmeny schémy len s osobitným produkčným preflightom; kód na main nie je dôkazom stavu produkčného D1 ani odoslaných e-mailov.

**P8 — Bezpečné odrezanie anonymného vstupu:** ponechať staré pending hlásenia moderovateľné; vypnutie anonymného vytvárania nesmie zablokovať admin editáciu, existujúce odkazy na Miu a iné prípady ani import/Notion synchronizáciu. Autorizácia je na API, nie iba redirectom stránky. Zachovať CSRF, rate limits, ochranu príloh a ochranu privátnych údajov.

## Akceptačné scenáre pre kroky 2–8

- Návštevník klikne „Nahlásiť strateného psa“ alebo „Nahlásiť nájdeného psa“ -> registrácia/prihlásenie -> onboarding (ak treba) -> správny typ konceptu; žiadna strata návratovej URL.
- Otestovať vytvorenie, rozpracovanie, odoslanie, vrátenie, opravu, opätovné odoslanie, schválenie a zamietnutie vo všetkých 6 kategóriách; vždy jeden kanonický profil a jedno správne vlastníctvo.
- Starý anonymný POST po cutovere nezaloží nový profil. Existujúce reporty a verejné URL zostávajú dostupné a moderovateľné.
- Partner A nemôže čítať/meniť koncept ani spravovať profil Partnera B; suspendovaný/revokovaný účet nevykoná úpravy.
- Úprava fotografie, galérie a poľa je bezpečná pri súbehu. Schválenie a publikácia neporušujú review-lock ani Notion sync.
- Partner môže vyžiadať označenie psa ako nájdeného bez obídenia povolených lifecycle prechodov.
- Potvrdenia a rozhodnutia: správny stav a URL, len jeden e-mail na prechod, delivery retry a bez úniku privátneho kontaktu.
- Privátny chat: správa sa priradí správnemu accountId a v Admine sa dá z podania prejsť na partnera a konverzáciu.
- Verejné kontaktné dopyty, redakčné tipy a recenzie zostávajú funkčné podľa svojho nezávislého účelu.
- Pred zapnutím v produkcii overiť testy, aktuálny main, migrácie/ledger a jeden izolovaný end-to-end scenár na skutočnom Workers runtime.

## Ďalšie kroky v rámci dohodnutých 8

2. Login/register návratová cesta a jasné tlačidlá pre verejné vytváranie profilov.
3. Nahradenie anonymných CREATE vstupov spoločným Partner workflow, parita potrebných polí a kontaktov, bezpečná deaktivácia starej tvorby.
4. Vlastníctvo nových a bezpečné prevzatie starých profilov, regresné testy.
5. Partner správa profilov a lifecycle akcie (najmä nájdený pes).
6. E-mailové oznámenia a stabilná obojsmerná komunikácia cez existujúci chat.
7. Centrálny Admin pre podania a dopyty: prepojenia a jednotná navigácia, nie nové shadow dáta.
8. Integračné testy, kontrola DB/Notion, produkčný rollout.

PR zostáva Draft, kým nie sú hotové aspoň kroky 2–4 a testy. Samotný audit nevyžaduje migráciu ani zmenu runtime.
