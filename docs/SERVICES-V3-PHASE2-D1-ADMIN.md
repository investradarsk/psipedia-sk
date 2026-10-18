# PSIPEDIA — SERVICES V3 / Fáza 2: kanonické D1 a Admin API

## Režim: izolovaný Draft PR — NEAKTIVOVAŤ
Táto fáza iba pripravuje schému 0133, D1 store a dvojito vypnuté Admin API. **Nespúšťať produkčnú migráciu, nenastavovať nové flagy, nenasadzovať, nemergovať bez súhlasu majiteľa.** PR #864 zostáva nedotknutý.

**Číslovanie:** Migrácia 0132 Facebook Images bola aplikovaná v produkcii. Services V3 rezervuje číslo 0133 iba ako pripravenú migračnú schému, bez automatického APPLY. Spustiť ju možno až po samostatnom schválení majiteľa.

## Pripravené tabuľky (všetky po migrácii začínajú prázdne)
- `service_catalog_admin_options`: dynamické možnosti vytvorené oprávneným Adminom, globálne jedinečné normalizované názvy a stabilné, serverom pridelené ID `svc.admin.* / attr.admin.*`; kategória, skupina, význam, verzia a história. Nová možnosť vždy začína ako `DRAFT` a čaká na Notion mirror (`PENDING`). Nie je automaticky verejná.
- `service_profile_option_choices`: iba výslovne uložené `yes` / `no`, bez záznamu je hodnota interná neznáma. Povinné verzie a bezpečný CAS chránia pred prepísaním.
- `service_profile_property_values`: pripravená tabuľka pre nebinárne hodnoty vlastností (napr. odborné zameranie alebo konkrétne skúšky), zatiaľ bez zapisovacieho rozhrania.

## Autorita a hranice
- Existujúci katalóg V0.3 ostáva nemenným základom; D1 dynamické možnosti ho len dopĺňajú, nikdy neprepisujú. Existujúce 91 ID a 21 starých filtrov sa nemenia.
- Novú kanonickú možnosť môže cez serverovú API vytvoriť výlučne prihlásený autorizovaný správca Psipedie; POST používa `requireAdminMutation` vrátane same-site a origin kontroly. Klient nemôže poslať ID, stav, dátum alebo verziu.
- Notion zatiaľ nemá žiadne zapisovacie právo ku kanonickému katalógu ani novú synchronizáciu. Pridávanie možností v Notione nikdy nebude vytvárať ID. Gemini/partner môže len navrhnúť.
- **Zápisy sú vypnuté**, pokiaľ nie sú naraz pravdivé serverové konfiguračné prepínače `SERVICE_CATALOG_ADMIN_WRITES_ENABLED` a `SERVICE_CATALOG_NOTION_MIRROR_READY`. Ani jeden nie je nastavený. Zapnutie bude vyžadovať ďalšie fázy a súhlas.
- Existujúce statické služby možno ukladať ako explicitné Áno/Nie až po aktivácii. Nové dynamické položky nemožno vybrať v DRAFT stave; ani ACTIVE položky bez potvrdeného Notion mirroru.
- API zatiaľ nepoužíva verejný profil, mapu ani filtre, nemení `services_json` či `source_data_json`, nerobí historický import.
- Ďalšie fázy musia implementovať správu stavu DRAFT → schválenie, synchronizáciu D1 → Notion, kontrolu driftu, kompaktný editor a prezentáciu so schválením vzhľadu.

## Testy a bezpečnosť
`node --experimental-strip-types --test tests/service-catalog-d1-foundation.test.mjs`

Testujeme prázdnu migračnú schému, referenčnú integritu, deduplikáciu, autorstvo, CAS, ochranu starých údajov, blokovanie chybného vstupu, archívnych profilov a oboch vypnutých zápisových brán.

**Žiadne produkčné zápisy, migrácie ani zmeny Notionu nie sú súčasťou tohto PR.**
