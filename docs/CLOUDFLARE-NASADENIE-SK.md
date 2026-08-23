# Nezávislé nasadenie Psipedia.sk na Cloudflare

Zdrojovým kódom je súkromný repozitár `investradarsk/psipedia-sk`. Súbor `wrangler.jsonc` opisuje staging Worker, statické súbory, D1, R2 a Images binding.

## Prvé staging nasadenie

1. V Cloudflare otvoriť **Workers & Pages** a vytvoriť Worker z GitHub repozitára.
2. Vybrať repozitár `investradarsk/psipedia-sk` a vetvu `main`.
3. Build command: `npm ci && npm run build`.
4. Deploy command: `npx wrangler deploy`.
5. Cloudflare pri prvom deployi automaticky vytvorí samostatnú D1 databázu a R2 bucket pre staging.

## Povinné premenné pred skúškou adminu

V **Worker > Settings > Variables and Secrets** nastaviť:

- `ADMIN_EMAILS` — e-mail alebo zoznam povolených redaktorov oddelený čiarkou,
- `ACCESS_TEAM_DOMAIN` — napríklad `https://nazov-timu.cloudflareaccess.com`,
- `ACCESS_AUD` — Application Audience tag z Cloudflare Access.

`AUTH_MODE=cloudflare-access` je už v `wrangler.jsonc`. Premenné neobsahujú heslo, ale upravujú sa iba v Cloudflare, aby bola konfigurácia účtu oddelená od kódu.

## Ochrana adminu

Cloudflare Access musí chrániť staging Worker alebo neskôr hostname `admin.psipedia.sk`. Worker overuje podpis JWT, jeho vydavateľa, audience aj platnosť a až potom odovzdá identitu aplikácii. Samotná e-mailová hlavička nestačí.

## Dáta

- D1: články, podujatia, adresár, dopyty, tipy, právne nastavenia a pomoc psom.
- R2: obrázky nahrané cez admin.
- `public/images`: obrázky uložené priamo v Git repozitári.

Produkčnú doménu `psipedia.sk` neprepínať, kým staging neprejde kontrolou stránok, adminu, databázy a obrázkov.
