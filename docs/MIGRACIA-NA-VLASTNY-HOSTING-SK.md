# Migrácia Psipedia.sk na vlastný GitHub a Cloudflare

Cieľom je odstrániť závislosť nasadzovania od ChatGPT Worku bez výpadku
existujúcej stránky.

## Fáza A – trvalý zdrojový kód

- [ ] Vytvoriť súkromný repozitár `investradarsk/psipedia-sk`.
- [ ] Nahrať vetvu `main` z dodaného Git bundle.
- [ ] Zapnúť dvojfaktorové prihlasovanie GitHub účtu.
- [ ] Chrániť vetvu `main` a vyžadovať úspešný build.
- [ ] Nikdy necommitovať `.env`, databázové exporty ani prístupové tokeny.

## Fáza B – vlastná infraštruktúra

- [ ] Pripojiť doménu do vlastného Cloudflare účtu.
- [ ] Vytvoriť Worker `psipedia-sk`.
- [ ] Vytvoriť D1 `psipedia-db` a R2 `psipedia-media`.
- [ ] Pripojiť bindingy `DB`, `BUCKET` a `IMAGES`.
- [ ] Importovať schému a produkčný obsah do novej D1.
- [ ] Preniesť všetky R2 objekty a porovnať počet a kontrolné súčty.
- [ ] Nastaviť `ADMIN_EMAILS` ako tajnú produkčnú premennú.
- [ ] Pridať `admin.psipedia.sk` a chrániť ho cez Cloudflare Access.
- [ ] Upraviť auth na overenú identitu Cloudflare Access; nestačí dôverovať
      ľubovoľnej hlavičke od návštevníka.

## Fáza C – automatické nasadzovanie

- [ ] Prepojiť Worker s GitHubom cez Cloudflare Builds.
- [ ] Build príkaz: `npm ci && npm run build`.
- [ ] Overiť preview URL a admin zápisy na testovacej databáze.
- [ ] Až potom nasadiť vetvu `main` do produkcie.

## Fáza D – bezpečné prepnutie domény

- [ ] Znížiť DNS TTL s predstihom.
- [ ] Overiť homepage, články, plemená, adresár, podujatia, pomoc, sitemapu,
      obrázky a admin.
- [ ] Prepnúť `psipedia.sk`, `www.psipedia.sk` a `admin.psipedia.sk`.
- [ ] Ponechať Sites nezmenený ako krátkodobú návratovú cestu.
- [ ] Po stabilizácii vytvoriť plnú D1, R2 a Git zálohu.

## Pravidelné zálohy

- denne: D1 export;
- týždenne: R2 inkrementálna kópia;
- pri každom release: Git tag a overený deploy;
- mesačne: skúšobná obnova do oddelenej D1 a R2.

## Podmienka ukončenia migrácie

Migrácia je hotová až vtedy, keď možno z čistého počítača klonovať GitHub,
spustiť lokálny web, nasadiť Worker, prihlásiť sa do adminu a obnoviť D1 aj R2
bez použitia ChatGPT Worku.
