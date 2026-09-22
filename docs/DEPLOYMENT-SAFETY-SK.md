# DEPLOY-1 – Fresh Artifact Before DB Mutation

Tento dokument definuje produkčný deployment safety contract pre Psipedia.sk.
DEPLOY-1 nemení databázovú schému, migračný chain ani CONFIG-1 ownership. Rieši iba
poradie a identitu artefaktu pri produkčnom Cloudflare deployi.

## Pôvodný problém

Pôvodný `deploy:cloudflare` vykonával:

```text
remote D1 migrations
→ remote breed audit
→ wrangler deploy dist/server/wrangler.json
```

Tento príkaz sám nevytváral čerstvý build. Ak neexistoval čerstvo vytvorený a
validovaný `dist/`, remote D1 sa mohla zmeniť skôr, než bolo isté, že existuje
nasaditeľný artifact pre daný commit.

## Nový produkčný contract

Jediný podporovaný produkčný príkaz zostáva:

```bash
npm run deploy:cloudflare
```

Ten teraz orchestruje tri fail-closed fázy.

### Cloudflare Workers Builds

Workers Builds má vlastný dvojkrokový lifecycle: najprv spustí **Build command** a až potom
**Deploy command**. Premenná `WORKERS_CI=1` je v tomto prostredí nastavená automaticky.

Keď je `deploy:cloudflare` spustený ako Deploy command vo Workers Builds, Cloudflare už
predtým vykonal nakonfigurovaný **Build command**. Deploy fáza preto iba nasadí pripravený
`dist/` cez generated Wrangler config; nespúšťa druhý build, druhú artifact validation ani
remote D1 príkazy. Tým sa Workers Builds drží platformového lifecycle
`Build command → Deploy command` bez vnoreného produkčného orchestration runnera.

Workers Builds je preto určený na automatické nasadenie kódu a assets. Zmena databázovej
schémy musí ísť cez explicitný manuálny produkčný deploy `npm run deploy:cloudflare`, ktorý
stále vykoná fresh build, artifact validation, remote D1 migrations, strict remote audit,
identity re-check a až potom Wrangler deploy.

Pri manuálnom/lokálnom produkčnom deployi sa teda safety contract nemení.

### Phase A — lokálna príprava artefaktu

1. `npm run config:check`
2. `npm run build`
3. `npm run validate:artifact`
4. validácia `dist/server/wrangler.json`, prepared Worker entry, assets a
   canonical D1/R2 bindingov
5. SHA-256 fingerprint celého `dist/` stromu

Žiadny remote D1 príkaz sa nesmie spustiť, kým všetky tieto kroky neprejdú.

Generated `dist/server/wrangler.json` zároveň nesmie deklarovať `build.command`.
Deploy preto nesmie spustiť druhý application build po remote DB mutation.

### Phase B — remote DB gate

Až po úspešnej Phase A:

1. `scripts/apply-remote-d1-migrations.mjs`
2. `npm run audit:breeds -- --remote --strict`

Breed audit je read-only D1 query. Ak migrácia alebo audit zlyhá, deploy sa
nespustí.

Po remote krokoch sa celý `dist/` znovu fingerprintuje. Ak sa fingerprint zmenil,
deploy failne. Tým je explicitne vynútené:

```text
build once → validate → mutate DB → deploy same artifact
```

### Phase C — deploy pripraveného artefaktu

Až po úspešnej identity kontrole sa spustí:

```text
wrangler deploy --config dist/server/wrangler.json --keep-vars --no-bundle
```

`--no-bundle` je zámerný safety prvok: Worker entry už vytvoril produkčný build,
a Wrangler po remote DB gate nesmie znovu kompilovať alebo prebundlovať iný
Worker artifact. Deploy používa generated config a presne pripravený `dist/`.
Orchestration medzi DB mutation a deployom nespúšťa `npm run build`, `vinext build`
ani iný application build krok.

## Failure semantics

| Zlyhanie | Remote D1 mutation | Deploy |
| --- | --- | --- |
| config check | nie | nie |
| production build | nie | nie |
| artifact/config validation | nie | nie |
| remote migration | migrácia môže byť čiastočne/úplne aplikovaná podľa D1 semantics | nie |
| remote strict audit | migrácia už mohla prebehnúť | nie |
| artifact identity re-check | migrácia už mohla prebehnúť | nie |
| Wrangler deploy po úspešnej migrácii | migrácia už prebehla | deploy zlyhal |

Posledné riziko nemožno odstrániť iba zmenou order-of-operations. DEPLOY-1 ho
minimalizuje tým, že Worker a assets sú kompletne vytvorené a validované ešte pred
remote mutation a po mutation sa nevytvára nový application ani Wrangler bundle.

## Testovateľnosť a PR bezpečnosť

Orchestration runner má injectable command runner a artifact validator. Focused
testy preto overujú poradie a failure paths bez spustenia reálneho `wrangler d1
... --remote` alebo production deployu.

Relevantné príkazy:

```bash
npm run test:deploy-safety
npm run config:check
npm run db:check-migrations
npm run db:validate-clean
npm run lint
npm run build
npm test
```

PR validácia nesmie aplikovať remote migrácie ani robiť production deploy.
Read-only production smoke môže bežať nezávisle cez existujúci GitHub Actions
workflow.

## CONFIG-1 a MIG-0/MIG-1 hranice

- Canonical Cloudflare resource bindings naďalej vlastní
  `config/cloudflare-resources.json`.
- Production Worker config ownership v `wrangler.jsonc` sa nemení.
- DEPLOY-1 nekóduje nové resource IDs ani secrets.
- Historické SQL migrations, Drizzle journal/snapshoty a clean-D1 chain sa nemenia.
- `scripts/apply-remote-d1-migrations.mjs` naďalej používa canonical D1 binding a
  generated deploy config.

## Prevádzkové pravidlo

Nespúšťajte remote D1 migration ako samostatný krok pred produkčným buildom.
Produkčné nasadenie má ísť cez `npm run deploy:cloudflare`, aby zostala zachovaná
invarianta:

**No remote DB mutation before fresh artifact validation succeeds.**
