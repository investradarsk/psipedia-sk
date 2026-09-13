# Nezávislé nasadenie Psipedia.sk na Cloudflare

Zdrojovým kódom je súkromný repozitár `investradarsk/psipedia-sk`. Súbor `wrangler.jsonc` opisuje staging Worker, statické súbory, D1, R2 a Images binding.

## Prvé staging nasadenie

1. V Cloudflare otvoriť **Workers & Pages** a vytvoriť Worker z GitHub repozitára.
2. Vybrať repozitár `investradarsk/psipedia-sk` a vetvu `main`.
3. Build command: `npm ci && npm run build`.
4. Deploy command: `npm run deploy:cloudflare`.
5. Cloudflare pri prvom deployi automaticky vytvorí samostatnú D1 databázu a R2 bucket pre staging.

Príkaz `deploy:cloudflare` pred každým nasadením bezpečne aplikuje iba chýbajúce D1 migrácie a potom nasadí Worker. Vďaka tomu sa nové databázové tabuľky a stĺpce vytvoria automaticky spolu so zmenou kódu.

## Povinné premenné pred skúškou adminu

V **Worker > Settings > Variables and Secrets** nastaviť:

- `ADMIN_EMAILS` — e-mail alebo zoznam povolených redaktorov oddelený čiarkou,
- `ACCESS_TEAM_DOMAIN` — napríklad `https://nazov-timu.cloudflareaccess.com`,
- `ACCESS_AUD` — Application Audience tag z Cloudflare Access.

`AUTH_MODE=cloudflare-access` je už v `wrangler.jsonc`. Premenné neobsahujú heslo, ale upravujú sa iba v Cloudflare, aby bola konfigurácia účtu oddelená od kódu.

## Redakčné e-mailové notifikácie cez Resend

Dopyty z adresára používajú Resend iba na interné upozornenie redakcie. Kontaktné údaje návštevníka sa neposielajú poskytovateľovi z adresára.

Pred produkčným nasadením nastav:

1. V Resend otvor **Domains**, pridaj doménu `psipedia.sk` a pridaj do Cloudflare DNS presne zobrazené záznamy pre odosielanie (najmä DKIM a SPF). Počkaj, kým Resend označí sending capability ako overenú.
2. V Resend otvor **API Keys**, vytvor samostatný produkčný kľúč s oprávnením **Sending access** a ak je dostupné obmedzenie na doménu, obmedz ho na `psipedia.sk`.
3. V Cloudflare otvor **Workers & Pages > psipedia-sk > Settings > Variables and Secrets** a pridaj:
   - `RESEND_API_KEY` ako **Secret** — hodnota je produkčný Resend API key,
   - `EDITORIAL_FROM_EMAIL` ako **Variable** alebo **Secret** — napríklad `Psipedia <notifikacie@psipedia.sk>`. Adresa musí patriť k doméne, ktorú má Resend overenú na odosielanie.
4. Kľúč ani odosielaciu adresu s citlivými údajmi nikdy necommituj do GitHubu. `.env.example` obsahuje iba názvy premenných.

Notifikačný e-mail ide na `psipedia.sk@gmail.com`. Resend request používa `Idempotency-Key`, takže opakovaný pokus s rovnakým dopytom používa rovnaký identifikátor správy.

`wrangler.jsonc` spravuje aj hourly Cron Trigger `0 * * * *`. Worker cez `scheduled()` raz za hodinu kontroluje dopyty staršie ako 24 hodín, ktoré sú stále v stave `new`. Keďže projekt spravuje cron cez Wrangler, produkčný trigger neupravuj paralelne ručne v dashboarde; ďalší Wrangler deploy by dashboardovú zmenu prepísal.

Zlyhané odoslania sa zapisujú do D1 tabuľky `directory_inquiry_notifications` (`status`, `attempts`, `last_attempt_at`, `last_error`, `provider_message_id`) a Worker zapisuje štruktúrované logy bez kontaktných údajov návštevníka. Diagnostika je dostupná v Cloudflare Worker logs/observability a v D1 outboxe.

## Ochrana adminu

Cloudflare Access musí chrániť staging Worker alebo neskôr hostname `admin.psipedia.sk`. Worker overuje podpis JWT, jeho vydavateľa, audience aj platnosť a až potom odovzdá identitu aplikácii. Samotná e-mailová hlavička nestačí.

## Dáta

- D1: články, podujatia, adresár, dopyty, notifikačný outbox, tipy, právne nastavenia a pomoc psom.
- R2: obrázky nahrané cez admin.
- `public/images`: obrázky uložené priamo v Git repozitári.

Produkčnú doménu `psipedia.sk` neprepínať, kým staging neprejde kontrolou stránok, adminu, databázy a obrázkov.
