# Psipedia.sk

Zdrojový kód slovenského portálu pre majiteľov a milovníkov psov.

## Rýchly štart

Požiadavky: Git a Node.js 22.13 alebo novší.

```bash
npm ci
npm run dev
```

Potom otvorte `http://localhost:5173`. Lokálny admin je na
`http://localhost:5173/admin`. Lokálne údaje D1 a R2 sú oddelené od produkcie
a ukladajú sa do ignorovaného priečinka `.wrangler/`.

Produkčný build overíte príkazom:

```bash
npm run build
```

## Dôležitá dokumentácia

- [Technická prevádzka, úpravy, nasadenie, záloha a obnova](docs/TECHNICKA-DOKUMENTACIA-SK.md)
- [Kontrolný zoznam migrácie na vlastný GitHub a Cloudflare](docs/MIGRACIA-NA-VLASTNY-HOSTING-SK.md)

## Hlavné priečinky

- `app/` – stránky, admin a API
- `components/` – používateľské komponenty
- `lib/` – obsahové modely a prístup k databáze
- `db/` a `drizzle/` – schéma a migrácie D1
- `public/images/` – obrázky uložené priamo v kóde
- `worker/` – vstupný bod Cloudflare Workeru

Tento export neobsahuje heslá ani krátkodobé prístupové tokeny.
