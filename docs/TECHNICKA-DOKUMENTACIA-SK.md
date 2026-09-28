# Psipedia.sk – technická dokumentácia

Stav auditu: 23. augusta 2026. Produkčný zdrojový commit pri audite:
`27fec3ead4e0c9fa20d25c805841a6ebbb146a18` (verzia Sites 12).

## Súčasný stav

| Oblasť | Kde je teraz |
| --- | --- |
| Produkčný web | OpenAI Sites, projekt `appgprj_6a81e375e2f08191beff13a32703ca5a`, doména `https://psipedia.sk` |
| Zdrojový kód | Interný Git repozitár Sites; tento balík je nezávislý export s históriou |
| Databáza | Cloudflare D1 spravovaná Sites, binding `DB` |
| Nahrané obrázky | Cloudflare R2 spravované Sites, binding `BUCKET`, čítané cez `/media/<kľúč>` |
| Statické obrázky | `public/images/`, sú súčasťou Git repozitára |
| Admin | `https://psipedia.sk/admin` |
| Oprávnenie admina | Tajná produkčná premenná `ADMIN_EMAILS` s povolenými e-mailmi |

Interný repozitár Sites nie je váš vlastný GitHub repozitár. Samostatný export
treba uložiť do súkromného repozitára, napríklad `investradarsk/psipedia-sk`.

## Kde je uložený obsah

### Databáza D1

| Tabuľka | Obsah |
| --- | --- |
| `managed_articles` | články a novinky, koncepty, publikovanie, URL slugy, zdroje a odkazy na obrázky |
| `managed_events` | výstavy, športy a ostatné podujatia |
| `directory_profiles` | tréneri, kluby, chovateľské stanice, veterinári a ďalšie profily |
| `directory_inquiries` | dopyty návštevníkov; môžu obsahovať osobné údaje |
| `help_cases` | útulky, záchrana, zbierky, stratené a nájdené psy |
| `news_tips` | tipy návštevníkov na novinky; môžu obsahovať osobné údaje |
| `legal_settings` | identifikačné a právne údaje prevádzkovateľa |

Schéma je v `db/schema.ts`, SQL migrácie v `drizzle/` a prístup k údajom v
`lib/*-store.ts`.

### Obsah uložený v kóde

- Plemená a desať skupín FCI: `lib/content.ts`.
- Základné články vložené pri prvej inicializácii D1: `lib/content.ts`.
- Štruktúra portálu a URL: `lib/portal.ts`.
- Kategórie noviniek: `lib/news.ts`.
- Typy podujatí a kraje: `lib/events.ts`.
- Kategórie adresára: `lib/directory.ts`.
- Kategórie pomoci: `lib/help.ts`.

Ak je pripojená D1, databáza je autoritatívnym zdrojom pre články, podujatia,
adresár a pomoc. Plemená sa zatiaľ upravujú priamo v kóde.

### Obrázky

Obrázky plemien a statické vizuály sú v `public/images/`. Obrázky nahrané cez
admin sa ukladajú do R2 pod kľúčmi ako `articles/2026/<uuid>.webp`,
`events/2026/<uuid>.webp`, `directory/2026/<uuid>.webp` alebo
`help/2026/<uuid>.webp`. D1 uchováva `image_url` a `image_key`.

## Ako funguje admin

Produkčný admin používa „Sign in with ChatGPT“, ktoré zabezpečuje Sites. Po
prihlásení Sites pošle serveru overený e-mail v hlavičke
`oai-authenticated-user-email`. `lib/admin-auth.ts` povolí iba e-mail v tajnej
premennej `ADMIN_EMAILS`. Oprávnenie sa kontroluje na serveri aj pre každé API.

Admin na nasadenom webe je použiteľný v bežnom prehliadači aj bez otvoreného
ChatGPT Worku. Stále však závisí od prevádzky Sites a jeho prihlasovacej vrstvy.
Na `localhost` funguje vývojový náhľad bez produkčného prihlásenia a používa
oddelené lokálne údaje.

## 1. Kde nájdem kód

Trvalým miestom má byť súkromný GitHub `investradarsk/psipedia-sk`. Dovtedy sú
k dispozícii `.bundle` s celou Git históriou a `.tar.gz` s aktuálnymi zdrojmi.

Klonovanie z Git bundle:

```bash
git clone psipedia-sk-full-2026-08-23.bundle psipedia-sk
cd psipedia-sk
```

Po vytvorení prázdneho GitHub repozitára:

```bash
git remote rename origin sites-export
git remote add origin git@github.com:investradarsk/psipedia-sk.git
git push -u origin main
```

## 2. Ako web upravím

```bash
git clone git@github.com:investradarsk/psipedia-sk.git
cd psipedia-sk
npm ci
npm run dev
```

Otvorte `http://localhost:5173`. Pred uložením zmeny overte:

```bash
npm run lint
npm run build
git add -A
git commit -m "Popis zmeny"
git push
```

## 3. Ako zmenu nasadím

### Kým web zostáva na Sites

Produkčné nasadenie musí prejsť cez lifecycle Sites. GitHub je v tomto režime
trvalá kópia zdrojov, nie priamy produkčný deploy.

### Odporúčaný nezávislý cieľ

Použite vlastný Cloudflare účet: súkromný GitHub ako zdroj pravdy, Worker pre
aplikáciu, vlastnú D1 (`DB`), R2 (`BUCKET`), Images (`IMAGES`), Cloudflare
Builds pre deploy z vetvy `main` a Cloudflare Access pre admin na
`admin.psipedia.sk`. DNS prepnite až po úplnom overení novej kópie.

Podrobný zoznam je v `docs/MIGRACIA-NA-VLASTNY-HOSTING-SK.md`.

## 4. Ako vytvorím zálohu

### Zdrojový kód

```bash
bash scripts/create-source-backup.sh
```

Vznikne Git bundle, zdrojový archív a SHA-256 kontrolné súčty. Bundle kopírujte
aj mimo GitHubu.

### D1 po migrácii na vlastný Cloudflare

```bash
npx wrangler d1 export psipedia-db --remote --output backups/d1.sql
```

### R2 po migrácii na vlastný Cloudflare

Po nastavení R2 S3 prístupu pre `rclone`:

```bash
rclone copy r2:psipedia-media backups/r2 --metadata
```

Databázové exporty môžu obsahovať osobné údaje. Necommitujte ich do GitHubu.

## 5. Ako obnovím predchádzajúcu verziu

### Chyba v kóde

```bash
git log --oneline
git revert <chybny-commit>
git push
```

Cloudflare vytvorí nový deploy. V núdzi možno v Workers Deployments znovu
nasadiť predchádzajúcu funkčnú verziu.

### Obnova D1

Najbezpečnejšie je vytvoriť novú prázdnu D1, importovať SQL a až po kontrole
prepnúť binding:

```bash
npx wrangler d1 execute psipedia-db-restore --remote --file backups/d1.sql
```

D1 má aj Time Travel pre bodovú obnovu, ale dlhodobé zálohy treba exportovať.

### Obnova R2

```bash
rclone copy backups/r2 r2:psipedia-media --metadata
```

Pred obnovou vždy zachovajte kópiu aktuálneho stavu.

## Oficiálne referencie

- [Cloudflare Workers – Git integrácia](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [Cloudflare D1 – import a export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Cloudflare R2 – zálohovanie cez rclone](https://developers.cloudflare.com/r2/examples/rclone/)
- [Cloudflare Access pre Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Cloudflare Workers – verzie a nasadenia](https://developers.cloudflare.com/workers/versions-and-deployments/)
