# PSIPEDIA.SK — Notion webhook-first od 30. 10. 2026

## Jeden mechanizmus pre všetky podporované Notion stránky

Notion -> Psipedia: prijatý podpisom overený `page.created`, `page.properties_updated` alebo `page.content_updated` sa **najprv zapíše do D1** (`notion_webhook_inbox`) a až potom dostane HTTP 200. Cloudflare Worker už má minútový Cron pre FB publisher. Ten istý minútový Cron teraz spúšťa **samostatný `waitUntil` inbox worker** a spracuje max. **8 udalostí/min**. Udalosť obsahuje iba ID a typ, aktuálne hodnoty sa čítajú z Notion až pri spracovaní.

**Nie je to plný sync všetkých databáz každú minútu.** Je to cielený sync jednej zmenenej stránky, čo šetrí Notion API a znižuje riziko 429. Čas do potvrdenia je cieľ, nie garancia: front môže narásť a retry používa backoff.

| Oblasť | Smer Notion -> Psipedia | Mechanizmus |
| --- | --- | --- |
| Plemená | Áno | Cielená stránka + ochrana identity, publikácie a médií |
| Články | Áno | Cielená stránka + schvaľovanie nových a aktualizácie publikovaných |
| Adresár služieb | Áno | Cielená stránka + kanonická ochrana polí |
| E-shopy | Áno | Cielená stránka |
| Podujatia, Organizácie, Adopcie, Pomoc psom, Stratené/nájdené | Áno | Dynamické data source ID z kanonických D1 agendových cieľov |
| Facebook obrázky | Áno | Cielená stránka cez `runNotionFacebookImagesSync({targetPageId})`, zachovanie publikátora a súhlasu |
| Katalóg Services V3 | **Nie (zámerne)** | Jednosmerné Admin/D1 -> Notion. Notion nesmie pridávať nové kanonické služby |
| Facebook články / Gmail mostík | Vlastný existujúci publikačný režim | Nemeniť bez samostatnej kontroly; Notion články sú už v spoločnom handleri |

Admin -> Notion: existujúce ukladanie v Admin spúšťa cielený writeback do Notion, kde ho agenda už podporuje. Webhook nie je náhrada za zápis z Adminu; **nepísať rovnakú zmenu na oboch miestach dvoma nesúvisiacimi cestami**.

## Zachovaná spoľahlivosť

- Signature HMAC, subscription ID, ID/data source ownership a strict per-page runner guard.
- V D1 deduplikácia webhook event ID, atomický claim/lease, limit pokusov, retry s exponenciálnou pauzou, `REVIEW` pri pretrvávajúcom probléme.
- Metadata-only echo nepúšťa ďalšiu synchronizáciu. U FB súhlas/autorita a už publikované príspevky zostávajú chránené. V dobehnutých záznamoch nehľadať nové práva na publikovanie.
- Pôvodná hodinová rekonsiliácia **zostáva** poistkou pri oneskorenej či chýbajúcej Notion udalosti. Starý päťminútový FB image full-sweep zostáva dočasne ako kompatibilná poistka proti výpadku webhook subscription.
- Nepoužívať ďalší Cron Trigger, platený provider, skenovanie 2 000+ profilov každých 60 sekúnd ani nový Notion token.

## Nasadenie a kontrola (vlastník)

1. Overiť existujúcu D1 migráciu `0145_notion_webhook_inbox.sql`, Worker `NOTION_WEBHOOK_SYNC_ENABLED=true`, `NOTION_WEBHOOK_INBOX_ENABLED=true`, podpisový secret a Notion webhook subscription **ACTIVE**. Subscription bola predtým pozastavená; po merge kódu sa neobnoví sama.
2. Overiť, že subscription posiela `page.created`, `page.properties_updated`, `page.content_updated` pre relevantné pripojené data sources. Bez doručenia nie je webhook sync; hodinová poistka zostane.
3. V Notione zmeniť jedno bežné pole na **už prepojenej publikovanej** Bearded kólii a Beauceronovi. Overiť po 1–3 min v Admin a na verejnej URL. Testovať aj článok, adresár, podujatie, pomoc a FB obraz bez publikovania na Facebook.
4. Cloudflare log `notion_webhook_inbox_sweep` obsahuje `claimed/done/retried/review`. Číslo `done` len potvrdzuje spracovanie udalosti — obsah porovnať samostatne. V Notion kontrolovať `Sync stav`, `Posledný sync`, `Psipedia ID` a `Sync chyba`.
5. D1 read-only diagnostika:
   ```sql
   SELECT status,COUNT(*) AS events,MAX(attempts) AS attempts
   FROM notion_webhook_inbox GROUP BY status;
   SELECT COUNT(*) AS due FROM notion_webhook_inbox
   WHERE status='PENDING' AND next_attempt_at<=unixepoch();
   ```
6. **Časy do 1–3 minút nie sú garantované**, najmä pri rate limite `429`, výpadku Notion, konfliktoch alebo fronte nad 8 zmien za minútu. Vtedy sa používa retry/hodinová poistka.

Ak po merge údaje ostanú rovnaké, kontrolovať Notion ACTIVE subscription a D1 inbox/Worker logy **pred** pridávaním ďalších cronov. Dlhé čakanie pri neprepojených historických profiloch nemusí byť problém intervalov; prepojenie a identity musia mať správnu kanonickú väzbu.
