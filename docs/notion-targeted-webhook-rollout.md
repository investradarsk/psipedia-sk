# Notion → Psipedia: cielený webhook (PR #1058)

**Stav po merge: predvolene vypnuté.** Bez manuálnej konfigurácie tento endpoint neprenáša žiadne Notion udalosti. Pôvodný hodinový synchronizátor funguje nezmenene.

## Čo funguje bez skenovania celej kategórie

- Notion `page.properties_updated` alebo `page.created` → načíta sa konkrétna stránka podľa `entity.id` a overí sa jej data-source identita.
- Podporované: **Adresár, Plemená, Články, E-shopy** (jedna stránka). Pri článkoch aj `page.content_updated` (pre ich vlastný obsah).
- **Podujatia, Organizácie, Adopcie, Pomoc psom, Stratené/nájdené**: rýchla cesta iba pre stránky s existujúcim potvrdeným mapovaním v `notion_agenda_targets` a agendových tabuľkách; nové nespárované záznamy ostávajú hodinovému importu.
- Admin ukladanie prepojeného profilu Adresára → cielené `targetProfileId`, bez Notion query celej databázy; existujúci writeback Plemená a Články ostáva zachovaný.
- Adresár a E-shopy vykonajú `PATCH` len na odlišných poliach a potrebných synchronizačných metadátach; neúplný remote objekt zastaví zápis.
- Ak Notion neposlal nové hodnoty, nemení sa nič. Zámerné vymazanie sa nedá vyvodiť z *chýbajúcej* vlastnosti. Automatické mazanie na Notion strane zostáva blokované starými bezpečnostnými pravidlami, ak neexistuje potvrdený úmysel.

## Jednorazové nastavenie (vykonať až po zelenom CI a merge)

1. Nasadiť nový kód so všetkými troma príznakmi **false**: `NOTION_WEBHOOK_SYNC_ENABLED`, `NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED`, `NOTION_WEBHOOK_HANDSHAKE_LOG_ENABLED`.
2. V Cloudflare dočasne povoliť iba `NOTION_WEBHOOK_HANDSHAKE_LOG_ENABLED=true`. Prístup k real-time Worker logom majú mať iba vlastníci.
3. V existujúcej Notion connection otvoriť **Webhooks → Create subscription**. URL: `https://psipedia.sk/api/integrations/notion/webhook`. Vybrať `page.created`, `page.properties_updated`, `page.content_updated`. Adresa musí byť verejne dostupná bez Cloudflare Access prihlasovacej obrazovky; podpísané udalosti sa autentifikujú HMAC.
4. Notion pošle jednorazový nepodpísaný `verification_token`. Tento token sa **len počas výslovne zapnutého režimu** objaví v obmedzených Cloudflare Worker logoch pri hlásení `notion_webhook_one_time_verification_token`. Skopírovať a vložiť do Notion Verify. **Token nikdy nezapisovať do GitHubu, komentára PR ani chatu.**
5. Rovnaký token nastaviť v **Cloudflare Worker Secrets** pod názvom `NOTION_WEBHOOK_VERIFICATION_TOKEN`, potom okamžite nastaviť `NOTION_WEBHOOK_HANDSHAKE_LOG_ENABLED=false`. Ber ho ako tajný kľúč; po retencii logov zaniká dočasná stopa. Pri podozrení na únik obnoviť subscription a token.
6. Po úspešnom podpísanom testovacom volaní zapnúť `NOTION_WEBHOOK_SYNC_ENABLED=true`. Voliteľne nastaviť `NOTION_WEBHOOK_SUBSCRIPTION_ID` pre ďalšiu ochranu.
7. Po produkčnom teste prepojeného profilu Adresára zapnúť `NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED=true`.

## Akceptačný test

1. Vybrať existujúci **prepojený Draft** veterinárny profil. V Notione zmeniť jedno bežné textové pole (napr. Telefón), uložiť a sledovať cieľový admin záznam. Overiť **iba tento profil a pole**, ako aj stav synchronizácie.
2. V administrácii zmeniť iné bežné pole (napr. Web) na tom istom profile. Po uložení skontrolovať nové pole v Notione a pôvodný Telefón.
3. Opakovať zmenu bez editácie / len otvorenie a uloženie: žiadne zbytočné editorial PATCH.
4. Simulovať zámerne konfliktné súbežné zmeny: nezapísať konfliktné údaje ani nepostúpiť potvrdený spoločný stav.
5. Odoslať falošný podpis → HTTP 401; neznámu alebo presunutú Notion stránku → nesynchronizovať.
6. Odoslať len automatické metadata z Notion → ignorovať a nezacykliť sync.
7. Poistiť nezmenené správanie Facebook obrázkov aj Services V3. **Žiadne testovacie zápisy do FB.**

## Obmedzenia

- Webhook event je oznámenie o zmene, **nie transakčný záznam novej hodnoty**. Konkrétny obsah sa načíta z Notionu; podkladom pre porovnanie je posledný potvrdený spoločný snapshot.
- Niektoré agendy historicky vyžadujú komplexné kontroly identity a schválenia. Nové, ešte nespárované Podujatia/Pomoc psom sa preto naďalej preberajú z existujúcej hodinovej kontroly.
- Pri Notion rate limite, výpadku alebo neoverenej odpovedi sa stav nepotvrdí. Notion má retry, hodinový Cron je poistka.
- Vymazanie existujúcej Notion hodnoty sa *nezamení* za chýbajúcu API property. Ak starý synchronizátor považuje zámerne prázdne pole za nepotvrdené mazanie, zachová bezpečné blokovanie na manuálnu kontrolu.
- Bez migrácií, bez novej externej služby, bez zmien Facebook sync plánovača.
