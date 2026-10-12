# GEMINI + NOTION — samostatný pracovník (bez produkčnej aktivácie)

Architektúra: Psipedia admin -> existujúci D1 harmonogram -> Cloudflare Cron (len dispatch) -> GitHub Actions -> Gemini Interactions API s Google Search a vlastnými nástrojmi -> priame Notion API čítanie/zápis konceptov -> HMAC callback do Psipedia admin.

Nezavádza sa ďalšia D1 migrácia; používa tabuľky z 0113 a už aplikovanej 0119. Nie je potrebné spúšťať žiadnu migráciu. Psipedia nespracúva kandidátov, duplicity ani polia Notion. Signed callback nahrádza Notion webhook, pretože vie presne spojiť ID úlohy s výsledkom.

## Bezpečnostné vypínače (ponechať vypnuté bez osobitného súhlasu)

Cloudflare: GEMINI_EXTERNAL_AGENT_ENABLED predvolene unset; nastav true iba pre explicitný manuálny test externého pracovníka. NOVÁ nezávislá poistka GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED musí zostať unset/false, kým sa výslovne neschváli automatické plánované spúšťanie. Aj keď je manuálny režim zapnutý, cron bez tejto druhej hodnoty neodošle platenú úlohu. Secrets: GITHUB_ACTIONS_DISPATCH_TOKEN (token len pre dané repo, Actions write) a GEMINI_AGENT_CALLBACK_SECRET.

GitHub Actions secrets: GEMINI_AGENT_API_KEY, GEMINI_AGENT_NOTION_TOKEN (úzko oprávnená Notion integrácia), PSIPEDIA_AGENT_CALLBACK_SECRET (identický ako secret na Cloudflare).

GitHub Actions vars: NOTION_DIRECTORY_DATA_SOURCE_ID, NOTION_EVENTS_DATA_SOURCE_ID, NOTION_HELP_DATA_SOURCE_ID a GEMINI_AGENT_PAID_ENABLED. Platený režim funguje iba pri GEMINI_AGENT_PAID_ENABLED=true; inak skript nevolá Gemini ani Notion.

Konkrétne Notion ID pre Pomoc psom zatiaľ musí byť doplnené a oprávnené k tejto integrácii; nepoužívajte náhodné ani nesprávne ID.

## Bezpečnosť

- Jedna aktívna úloha globálne: existujúci čiastočný unique index v 0119.
- Externé úlohy dostávajú status RUNNING hneď pri rezervácii; starý Cron runner vyberá iba QUEUED. V externom režime je starý Cron runner navyše vypnutý.
- Nejednoznačný stav odpovede GitHub dispatch zostane RUNNING a blokuje nové úlohy, kým ho človek nepreverí. Bez automatického opakovania platených požiadaviek.
- Maximálne 5 konceptov na beh a najviac 9 požiadaviek Gemini Interactions (počiatočná + 8 nadväzujúcich). Konzervatívna poistka najviac 10 zaradených Gemini úloh mesačne v spoločnej fronte; nejde o priamy finančný limit.
- Číta sa celá cieľová Notion data source; neúplné načítanie sa odmietne. Kontrola duplicít a vyplnenie polí prebieha výhradne v agentovi.
- Nové stránky môžu mať iba existujúci draft status (Koncept, Nápad, Na kontrolu, Ready). Vyžaduje sa verejný HTTPS zdroj; agent nikdy nezverejňuje.
- Mapovanie podľa overeného Notionu: **Adresár** má v poli `Kategória` technické slugs (`veterinari`, `salony-a-sluzby`…), preto sa nemenia; **Podujatia** majú v `Typ podujatia` slovenské jednotné hodnoty (`Výstava`, `Seminár`, `Tréning`, `Iné`…), preto worker mapuje URL slug na kanonický typ. Neznáme slugy podujatí sa odmietnu pred zápisom. Pre Pomoc psom treba pri akceptácii zvlášť potvrdiť skutočné polia.
- Neopakovať Notion POST /pages po neistom výsledku; pred opätovným spustením sa musí skontrolovať Notion.
- Callback je HMAC SHA-256 s obmedzenými číselnými údajmi a je platný iba raz počas RUNNING jobu.

## Dôležité obmedzenia a akceptácia

Google Search s custom functions v Gemini je stále Preview. Kompatibilitu so skutočnou schémou Notion a modelom gemini-3.8-flash treba potvrdiť kontrolovaným live testom až po výslovnom povolení.

Pevný rozpočtový strop 5 EUR nie je v tomto kóde presne vynútiteľný: po zapnutí nastavte kvóty / billing upozornenia u poskytovateľa a sledujte spotrebu. Žiadny platený test nesmie začať pred výslovným súhlasom.

Nastavovanie zostáva na /admin/automatizacie-gemini. GitHub workflow nemá plánovaný trigger, iba workflow_dispatch. Notion koncepty sa môžu existujúcou synchronizáciou dostať do D1, ale nesmú byť automaticky publikované. Oznámenie o výsledku sa ukladá do existujúceho systému admin upozornení a história zobrazuje počty; Notion-origin webhook a odkazy na každú novú stránku nie sú súčasťou tejto fázy. Odoslanie do iPhone push závisí od nastavenia už existujúcej služby administrátorských upozornení.

Pred akoukoľvek aktiváciou: preveriť staré QUEUED/RUNNING joby v 0119; overiť offline testy a build; povoliť iba jeden kontrolovaný manuálny beh s max 1 konceptom; `GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED` musí byť false/unset aj po zapnutí manuálneho režimu; overiť presnú schému Notion, účtovanie a stav histórie. Následná automatizácia vyžaduje osobitné explicitné povolenie druhej poistky. Nemergovať ani nenasadzovať bez schválenia.
