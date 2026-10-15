# GEMINI-EXTERNAL-MANUAL-QUEUE-1

## Cieľ
Keď už jeden externý Gemini → Notion pracovník beží, druhá výslovne potvrdená požiadavka v administrácii sa už neodmieta. Zaradí sa do D1 FIFO poradovníka a spustí sa po dokončení predchádzajúceho pracovníka.

- Jeden aktívny pracovník globálne. Jedna čakajúca alebo bežiaca úloha na kategóriu (22 kategórií).
- Po kliknutí sa zaznamená konkrétne adminom potvrdená úloha, identita kategórie a aktuálne nastavenie; bez okamžitého plateného volania pri obsadenom pracovníkovi.
- Prvá voľná úloha sa spúšťa ihneď pri zaradení; ďalšie už potvrdené požiadavky sa spracujú cez existujúci Cloudflare päťminútový cron.
- **Automatické plánovanie nových platených úloh zostáva vypnuté**, pokiaľ nemá osobitne povolený plánovač. Poradovník spotrebúva výlučne administrátorom už potvrdené manuálne úlohy.
- Opakované kliknutie v rovnakej kategórii vráti existujúce ID, bez druhej platenenej úlohy.
- Práve bežiacu úlohu s neistým výsledkom systém sám neopakuje. Poradovník ostáva zastavený, kým operátor nevyhodnotí RUNNING/timeout.
- Nemení sa Gemini prompt, ochrana HMAC callbacku, proveniencia Notion stránok, import ani publikovanie.

## Nová pripravená migrácia D1 0129 (NOT APPLIED)
`drizzle/0129_gemini_external_manual_queue.sql` nahradí historický globálny unikátny index na stav QUEUED/RUNNING globálnym unikátnym indexom **iba na RUNNING**. Index jedného aktívneho jobu na kategóriu zostáva nedotknutý.

SQL je pripravené pre samostatný schvaľovaný rollout; táto vývojová úloha migráciu **neaplikuje**. Preto:

1. Overiť nasadený produkčný stav migrácií a úspešne aplikovať/overiť predchádzajúcu 0128 samostatným povoleným procesom, pokiaľ ešte nebola aplikovaná.
2. Samostatne schváliť bezpečný read-only preflight a rollout **0129**, keď už nebežia Gemini pracovníci; až potom merge/nasadenie nového backendu.
3. Pred live zapnutím overiť prítomnosť `idx_gemini_manual_only_one_running` a neprítomnosť `idx_gemini_manual_only_one_active`. Neaplikovať priamo bez autorizácie.

`scripts/production-d1-migrate.mjs` registruje 0129 ako `PREPARED`, nie `SUPPORTED`. Prevádzková aplikácia musí byť autorizovaná samostatne ako doterajšie migrácie.

## Akceptácia
- Pri obsadenom pracovníkovi kliknúť na druhú kategóriu: zobrazí sa „zaradená do poradovníka“, aj v zozname „Úlohy na pozadí“.
- Ďalšie potvrdené kategórie čakajú FIFO; nesmú naraz bežať dva RUNNING joby.
- Duplicate click v tej istej kategórii nevytvorí ďalšie ID/volanie.
- Cloudflare Cron spracuje ďalší manuálny čakajúci job, aj keď `GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED=false`.
- Neistý GitHub dispatch zachová RUNNING; po callbacku sa začne nasledujúca výslovne potvrdená úloha, v čase ďalšieho Cronu.
- Bez merge, produkčných zápisov, platených Gemini volaní a deploymentu počas prípravy.
