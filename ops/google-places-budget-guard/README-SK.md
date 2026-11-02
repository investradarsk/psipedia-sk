# Psipedia – vypnutie Google Places po dosiahnutí 5 €

Táto samostatná Google Cloud Run function (Gen2) reaguje na pravidelné oznámenia Cloud Billing cez vyhradený Pub/Sub topic. Ak odhadovaná skutočná mesačná spotreba správneho rozpočtu dosiahne 5 EUR, automaticky vypne IBA Places API (New) v projekte psipedia-production.

- Nedotýka sa Gemini, Notion, Cloudflare, Maps API ani fakturačného účtu.
- Places API sa nikdy automaticky znovu nezapne.
- Kontroluje fakturačný účet, konkrétne ID a názov rozpočtu, menu, sumu aj aktuálny mesiac (pacifický čas). Nepoužíva predpoveď nákladov.
- Predvolene je neaktívna: PSIPEDIA_GUARD_ENABLED=false.
- NIE JE garantovaný pevný finančný strop. Oznámenia môžu meškať niekoľko hodín a účet môže prekročiť 5 EUR. Ponechaj dennú kvótu v Google Cloud. Cloud Run a Pub/Sub môžu mať vlastné náklady.

## Aktivácia v Google Cloud po merge PR

1. V správnom fakturačnom účte 01B80F-785E05-3CE7BE otvor Budgets & caps → Psipedia Google Maps. Over: mesačný rozpočet 5 EUR (Specified amount), projekt Psipedia Production (nie All projects), služby Places API (New) a prípadne Maps API. Ak sú vybrané aj iné projekty, najprv uprav scope.
2. Otvor editor rozpočtu a skopíruj UUID rozpočtu z adresy URL /budgets/UUID/edit (NIE billing account ID). To sa použije ako PSIPEDIA_BUDGET_ID.
3. V projekte psipedia-production vytvor VYHRADENÝ Pub/Sub topic s názvom psipedia-places-budget-alerts. Nenechávaj verejne dostupné právo publish. V editore rozpočtu v časti Actions → Manage notifications → Connect a Pub/Sub topic to this budget ho vyber a ulož. E-mailové alerty nestačia.
4. V IAM vytvor dedikovaný service account psipedia-places-guard@psipedia-production.iam.gserviceaccount.com. Prideľ mu na projekte iba oprávnenia serviceusage.services.get a serviceusage.services.disable (preferuj vlastnú IAM rolu; rolá roles/serviceusage.serviceUsageAdmin je širšia). Nevytváraj JSON kľúče.
5. Zapni potrebné API pre Cloud Functions/Cloud Run, Eventarc, Pub/Sub, Cloud Build, Artifact Registry a Service Usage. Pre Eventarc bude možno potrebné povoliť projektových service agentov.
6. Po merge spusti v Cloud Shell (z koreňa repozitára) toto nasadenie v NEAKTÍVNOM režime:

~~~bash
export BUDGET_ID='SEM-VLOZ-SKUTOCNE-UUID-ROZPOCTU'
gcloud config set project psipedia-production
gcloud functions deploy psipedia-places-budget-guard \
  --gen2 --runtime=nodejs22 --region=europe-west1 \
  --source=ops/google-places-budget-guard \
  --entry-point=psipediaPlacesBudgetGuard \
  --trigger-topic=psipedia-places-budget-alerts \
  --service-account=psipedia-places-guard@psipedia-production.iam.gserviceaccount.com \
  --set-env-vars="PSIPEDIA_BUDGET_ID=$BUDGET_ID,PSIPEDIA_GUARD_ENABLED=false"
~~~

Nevystavuj verejný HTTP endpoint a nepoužívaj --allow-unauthenticated. Ide o Pub/Sub/Eventarc trigger.

7. Skontroluj v Cloud Logging, či prichádzajú pravé rozpočtové správy s atribútmi budgetId a billingAccountId. Syntetický test prekročenia rozpočtu rob IBA v režime PSIPEDIA_GUARD_ENABLED=false, lebo po aktivácii by si vypol reálnu službu.
8. Až po overení správ a oprávnení zmeň environment premennú PSIPEDIA_GUARD_ENABLED na true v konfigurácii funkcie a aktualizuj deploy. Bez tohto kroku vypínanie NIE JE AKTÍVNE.

## Ručné opätovné zapnutie

Na začiatku ďalšieho mesiaca: Google Cloud → APIs & Services → Places API (New) → Enable. Alternatívne:

~~~bash
gcloud services enable places.googleapis.com --project=psipedia-production
~~~

Ak Places API znovu zapneš v rovnakom mesiaci, keď už rozpočet prekročil 5 €, ďalšia platná správa ho znova vypne.

## Obmedzenia

- Pub/Sub doručuje opakovane a mimo poradia. Funkcia staré správy ignoruje a opakované vypínanie je idempotentné.
- Výpadok Pub/Sub, Cloud Run, Service Usage oprávnení či rozpočtových oznámení môže zabrániť vypnutiu. Sleduj logy a nastav alerty na chyby.
- Zmena ID, názvu, meny alebo sumy rozpočtu spôsobí bezpečné ignorovanie správ, kým sa konfigurácia neupraví.
- Vypnutie Places API v projekte zastaví aj ručné hľadanie Google miest v administrácii Psipedie. Nedotkne sa uložených profilov.
- Nepoužívaj vypnutie celého Cloud Billing účtu, pretože tým môžeš ohroziť iné služby.

Oficiálne zdroje:
- https://docs.cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications
- https://docs.cloud.google.com/service-usage/docs/reference/rest/v1/services/disable
