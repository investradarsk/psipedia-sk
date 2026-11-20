# Psipedia.sk — Partneri V2, krok 7/8: súkromné správy a upozornenia

Dátum: 20. novembra 2026
PR: #1467, stav Draft, **nemergovať/nedeployovať**.

## Rozsah implementácie

### Súkromný chat

- Jedna konverzácia pre každé \`partner_accounts.id\` (nie jeden chat pre každý profil).
- \`/partner/spravy\` na partnerskej strane; Admin → Partneri → konkrétny partner → záložka **Správy** na správcovskej strane.
- Historické správy sú v D1 tabuľke \`partner_chat_messages\` naviazanej cez jedinečné \`partner_conversations.partner_account_id\`. Stránkovanie 50 správ, obnovovanie počas otvoreného chatu približne každých 20 sekúnd, potvrdenie prečítania samostatnou autorizovanou mutáciou.
- \`app/admin/partners/page.tsx\`: presný počet neprečítaných správ jednotlivých partnerov namiesto zástupného „—“. Detail partnera zobrazuje count a živú záložku.
- Správy môže písať overený aktívny partner alebo autorizovaný Admin. Identita odosielateľa sa odvodzuje zo serverového overenia relácie, nie z požiadavky klienta. Správy sú viazané konkrétnym ID účtu a medzi partnermi sa nedajú čítať.
- Max. 4 000 znakov správy, najviac 3 súbory (JPG, PNG, WebP alebo PDF), 5 MB na jeden súbor a 12 MB spolu. Prílohy sú len na stiahnutie, neservírujú sa verejne inline.
- Prílohy sa ukladajú do R2 pod **\`quarantine/partner-chat/\`**. Existujúce verejné \`/media/[...key]\` odmieta \`quarantine\` prefix. Nevyužíva sa verejný URL odkaz. GET download prechádza samostatným overením Partner relácie / Admin oprávnenia a SQL väzby na konverzáciu, vracia \`attachment\`, \`nosniff\`, \`no-store\`, \`CSP sandbox\`.
- Pri zlyhaní D1 insert/batch sa už uložené R2 súbory odstránia; správy sa neposielajú na e-mail ako obsah.

### Notifikácie

- Partner: e-mailové a interné upozornenia majú dva jednoduché samostatné prepínače v \`/partner/nastavenia\`, **oba predvolene zapnuté**. Prihlásenie a reset hesla sa ani po vypnutí e-mailových notifikácií neblokujú.
- Nové správy od Admina vytvárajú úlohu v \`partner_chat_email_queue\` len ak je povolený e-mailový kanál. Tento malý outbox je potrebný kvôli existujúcemu CHECK obmedzeniu \`partner_notification_outbox.notification_type\`; nevykonáva sa nebezpečné prestavanie produkčnej tabuľky.
- Existujúci plánovaný \`runPartnerNotificationSweep\` spracuje aj novú chat e-mail frontu cez rovnakého poskytovateľa Resend a dešifrovanie uloženého partner e-mailu; jednotlivé správy sú idempotentné podľa ID. Mail obsahuje len odkaz na prihlasovací partner priestor, bez textu chatu alebo prílohy.
- Odhlásenie e-mailového kanála platí aj na existujúce voliteľné oznámenia z \`partner_notification_outbox\`; autentifikačné e-maily sú výnimka.
- \`/partner/upozornenia\` zobrazuje rozhodnutia existujúcich partner žiadostí a prichádzajúce správy. História rozhodnutí je dostupná aj v \`/partner/ziadosti\` bez ohľadu na prepínače.
- Interné upozornenia: aktívny banner neprečítaných správ na partnerskom prehľade iba pri zapnutom \`inAppEnabled\`; správy ani história sa vypnutím kanála **nemažú**.
- Admin: každá nová správa od partnera vytvára existujúcu \`admin_notification_events\` s odkazom na konkrétny detail; kategória \`PARTNER_REQUEST\`, žiadny novovytvorený Admin mail.

### Jedna jediná migrácia pre tento krok

\`drizzle/0175_partner_private_chat.sql\` — **nové**:
- \`partner_conversations\`
- \`partner_chat_messages\`
- \`partner_chat_attachments\`
- \`partner_notification_preferences\`
- \`partner_chat_email_queue\`

Sú to additívne SQL objekty s FK, unikátnosťou konverzácie, checkmi pre prílohy, role, veľkosť správ a zapínanie kanálov. **Žiadne existujúce články, profily, Notion lock, údaje partnera ani staré migračné verzie sa nemenia.**

Migrations 0171/0172 sú už produkčne nasadené; 0173/0174 patria iným agendám. **Číslo 0175 treba pri kroku 8 preveriť voči aktuálnemu \`main\` a produkčnému D1 migration ledger, pretože v iných vetvách súčasne vznikajú SQL zmeny.** V tejto fáze sa migrácia iba pridala do Draft PR. Neaplikovať ju automaticky s obvyklým migračným backlogom.

## Zmenené/nové hlavné súbory

- \`lib/partner-chat.ts\`, \`lib/partner-chat-email.ts\`, \`lib/partner-inbox.ts\`
- \`lib/partner-email.ts\` — spoločný sweep a rešpektovanie e-mailového nastavenia
- \`lib/admin-automation-push-policy.ts\`
- \`components/partner-private-chat.tsx\` + CSS, \`components/partner-notification-settings.tsx\`
- \`app/api/partner/chat\`, \`app/api/admin/partners/chat/[accountId]\`, read a download route, \`app/api/partner/notification-preferences\`
- \`app/partner/spravy\`, \`app/partner/upozornenia\`, \`app/partner/nastavenia\`, \`app/partner/page.tsx\`, \`components/partner-shell.tsx\`
- \`app/admin/partners/accounts/[id]/page.tsx\`, \`app/admin/partners/page.tsx\`, \`lib/partner-admin-store.ts\`
- \`db/partner-schema.ts\` a \`drizzle/0175_partner_private_chat.sql\`.

## Release blockers do 8/8

**Používateľ nechce priebežne čakať na testy**; v tomto kroku boli len zapracované súbory a pridané \`tests/partner-private-chat-step7.test.mjs\`. **Žiadne úspešne dokončené CI / build / staging / R2 / produkčné D1 overenie teraz nevyhlasujeme.**

Pred spojením PR #1467:
1. Zosúladiť vetvu s aktuálnym \`main\` (v čase kroku 7 divergovala; cca 53 commitov za main). Overiť migračné číslo 0175 na main a v D1 ledger aj presnú schému.
2. Chránenou jednorazovou migráciou nasadiť iba 0175 **pred** nasadením kódu, bez prehrávania historických migrácií.
3. Testovať izoláciu account A/B, spoofovaný sender, odcudzený attachment UUID, priamu verejnú \`/media/quarantine/partner-chat/...\` cestu (404), Admin/Partner auth, CSP/headers, limity, MIME spoofing, rollback R2 pri D1 konflikte, rate limiting a manuálne revokované účty.
4. Otestovať všetky notifikácie: oba default ON; vypnúť e-mail a ponechať in-app, vypnúť in-app a ponechať e-mail, oba vypnúť, zachovať login/reset, Resend retry+idempotencia, oddelenie vlastného prečítania od Admin.
5. Nezamlčať riziko: R2 upload a D1 INSERT nie sú spoločnou transakciou; D1 konflikty odstraňujú R2 kľúče, no pri náhlom páde Workeru môžu vzniknúť osirelé objekty. Zaviesť cleanup/retenciu podľa bezpečnostnej politiky pred nasadením.
6. Súčasné priame verejné úpravy a Admin editory z krokov 4–6 stále vyžadujú integračné testy a ochranu proti obídeniu schválenia. Všetky významné verejné údaje musia zostávať v SQL.
7. Pred publikovaním otestovať na skutočnom Workers runtime: navigáciu a responsivitu mobilu, polling, čítacie potvrdenia, náhľad súboru/jeho sťahovanie a kontakt so súkromným R2 bucketom.

## Stav

**7/8 – implementácia zapracovaná na pracovnej vetve PR #1467. Draft, nenasadené a neoverené.**
Nasleduje **8/8**: výlučne záverečná integrácia, E2E, CI, reconciliácia \`main\`, migračný preflight a bezpečný rollout.
