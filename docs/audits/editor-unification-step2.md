# Psipedia – 18 krokov, krok 2: open-source editor foundation

Status: pripravený pilot v izolovanom, autorizovanom náhľade. Žiadne produkčné editory ani perzistentné modely ešte nie sú migrované.

## Overený upstream

- Projekt: [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)
- Licencia: MIT (Copyright 2024 Sat Naing), plný text uchovaný v `third_party/shadcn-admin/LICENSE`.
- Prevzaté a vizuálne prispôsobené: kompozícia Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Textarea zo `src/components/ui/`. Identifikačný kontrakt `data-slot` zostáva zachovaný.
- Neprenáša sa Vite, TanStack Router, Clerk autentifikácia, globálna šablóna, ani cudzie routovanie. Upstream je dashboard vo Vite, nie hotový editor pre Next.js.
- Psipedia používa Next.js 16 / React 19 / Tailwind 4, existujúci AdminShell, Cloudflare Access, D1, Lexical. Základ je komponovaný s týmito existujúcimi nástrojmi, bez nových npm dependencies.

## Čo je reálne integrované

1. `components/admin-shadcn-editor-primitives.tsx`: open-source komponenty Card/Input/Textarea (upravené pre lokálny štýl).
2. `components/admin-shadcn-editor.module.css`: izolované brand tokeny, kompaktné polia, bez prepísania verejných štýlov.
3. `components/admin-unified-editor-workspace.tsx`: jednotná navigácia desktop/mobile, vždy jedna aktívna sekcia, všetky sekcie zostávajú namontované v DOM, jeden dokumentový scroll, voliteľný náhľad, slot pre akcie.
4. `components/admin-shadcn-editor-preview.tsx`: štyri lokálne príklady (plemená, články, služby, podujatia), krátke a dlhé polia, telefón, dátum, čas a simulácia uloženia/publikovania.
5. `app/admin/unified-editor-preview/page.tsx`: admin-auth chránená stránka `/admin/unified-editor-preview` s čisto lokálnymi dátami. Nie je v hlavnej navigácii a nevolá žiadne API.

## Ochrana existujúcej prevádzky

- Žiadne zmeny tabuliek D1, migrácií, Notion webhookov, API alebo synchronizácie.
- Žiadne zmeny editora plemien, článkov, služieb, podujatí, Pomoc psom.
- Ukážka nevykonáva `fetch` ani zápisy; tlačidlá menia iba stav React v prehliadači. `Publikovať` je explicitne označená lokálna simulácia s potvrdením.
- Prístup podlieha `requireAdminPageUser`. Neautorizovaný návštevník nemá verejnú cestu do editora.
- Krok 3 musí prijať rozhodnutie o navigácii a až následne sa kód postupne uplatní na canonical editory.
- V kroku 6 bude dopojená jednotná ochrana neuložených zmien, publikovania a navigácie; nie je súčasťou tohto izolovaného pilotu.
- Príklady telefónu, vstupného a termínov nie sú nové uložené polia. Skutočná migrácia podujatí patrí do kroku 10.

## Návrh akceptácie pilotu

- Otvoriť `/admin/unified-editor-preview` ako admin.
- Prepínať štyri typy. Overiť, že sa nemení rozloženie navigácie, vstupov a akčnej lišty.
- Prepínať sekcie. Je viditeľná iba vybraná; nevzniká vnútorný scrollbar a rozpracované hodnoty sa nestrácajú.
- Skontrolovať 390/320 px mobil, čitateľnosť, klávesnicu, focus, kontrast a textarea rastúcu s textom.
- Lokálne upraviť text, uložiť, simulovať publikovanie, zavrieť/otvoriť stránku; žiadne dáta sa nedotknú D1 a Notion.
- Spustiť build/Playwright v CI; bez výsledkov nesľubovať plnú kompatibilitu pri ostrých editoroch.

## Ďalší krok

Krok 3: vybrať jedno finálne ovládanie a vyrobiť produkčný spoločný navigačný shell. Existujúce canonical editory prepojiť až v samostatných nasledujúcich krokoch.
