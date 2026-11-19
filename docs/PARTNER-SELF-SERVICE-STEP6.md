# Psipedia Partner – krok 6/8: jednotné priame ukladanie D1 a bezpečné hranice Notion

## Model oprávnení

Záznam môže mať najviac jedného aktívneho externého správcu, účet môže spravovať viac záznamov. Nové záznamy stále podliehajú počiatočnému schváleniu v kroku 7. **Existujúce schválené** záznamy sa od tohto kroku menia priamo:

- Služby pre psov – `directory_profiles`, vrátane kategóriových filtrov, galérie a kontaktov v ich skutočných kanonických poliach;
- Organizácie – `help_organizations` a už existujúce primárne `organization_locations`;
- Podujatia – `managed_events`;
- Pomoc psom – priame editory `adoption_dogs`, `lost_found_dog_reports`, `help_cases` z kroku 5.

Pôvodné editačné komponenty služieb a podujatí ostali zachované. Zmenil sa ich spôsob ukladania, nie dátový model ani grafické komponenty. Systémové polia, publikácia, SEO, slug, interné údaje a súkromné kontakty zostávajú administrácii.

## Ochrana transakcií

- Server vykonáva nezávislé overenie session, dokončeného onboardingu, aktívneho partnera a oprávnenia k presnému záznamu.
- Zmeny sa validujú proti existujúcim field allowlistom / normalizátorom. Klient neposiela celý kanonický objekt; menia sa iba skutočne upravené polia.
- Každý SQL UPDATE nesie **optimistickú kontrolu `updated_at` a EXIS​TS schváleného aktívneho OWNER** v tej istej operácii. Súbežná úprava či zrušenie prístupu skončí konfliktom HTTP 409 a nemôže prepísať celý záznam.
- Spoločné `buildDirectoryApplyStatement` a `buildHelpApplyStatements` z pôvodného admin-review zostali jediným kanonickým zapisovačom profilu; voliteľný `directGuard` pridáva vlastníctvo a verziu iba pri priamom Partner zápise.
- Hlavné fotografie aj galéria využívajú existujúci `/api/partner/media` a safe WebP objekt. Na kanonický riadok sa pripoja iba v transakcii, ak obraz stále vlastní správny Partner a je `PENDING`; opakovane použitý asset sa odmieta.
- Append-only `partner_audit_events` uchováva identitu partnera, typ, zoznam menených polí a `baseUpdatedAt` bez súkromných hodnôt. Staré moderované UPDATE žiadosti sa môžu dokončiť pôvodným admin review; ich optimistická verzia zabráni dvojitému prepisu.
- Verejný HTML cache detailu, relevantných výpisov a geo-projekcií sa po zápise obnovuje alebo invaliduje cez existujúce helpery.

## Notion – nesľubovať nepreukázané LWW

**D1 je jediný kanonický záznam verejných údajov; Notion je externá redakčná replika.** Priamy zápis nesmie aktualizovať synchronizačný baseline tak, aby sa stará hodnota z Notion javila ako nová. Existujúci trojcestný sync `notion-profile-field-reconciliation.ts` rozpozná D1-only zmenu a pokúsi sa ju preniesť do Notion, prípadne bezpečne zlúčiť zmeny rôznych polí. Zhodný field upravený na oboch stranách bez dôkazu poradia zostáva **CONFLICT**, nie tiché prepísanie.

Notion API neposkytuje spoľahlivý per-field čas každej historickej zmeny. `last_edited_time` celej stránky nie je čas konkrétneho poľa. Preto **pravidlo „najnovšia hodnota v každom poli vyhráva“ pre súbežné úpravy toho istého poľa nie je zatiaľ plne dokázateľné**. Automatické hádanie podľa času celej stránky by mohlo stratiť údaje; pred finálnym nasadením treba samostatné auditované potvrdenie konfliktov alebo explicitné per-field revízie na oboch stranách. Tento rozdiel je kritériom finálneho kroku 8.

Starý jednosmerný Notion event sweep je pri priamych aktualizáciách už schválených podujatí blokovaný cez existujúce `event_notion_sync.inbound_locked_at` – rovnaký princíp používalo moderované ukladanie podujatí. Nový obojsmerný sync ostáva zodpovedný za synchronizačný výsledok. **Samotný úspech zápisu D1 sa nemá zobrazovať ako potvrdené doručenie do Notion**.

## Overenie a rollout

- `tests/partner-direct-save-step6.test.mjs` testuje reálny SQLite guard vlastníctva, verzie, stav fotografie a konflikt simultánnej zmeny Notion ↔ D1.
- Existujúce partner auth, partner events, profile moderation a Help regresie musia zostať funkčné; nový zápis neodstraňuje staré pending moderácie.
- **Žiadna nová migrácia**; `0171` a `0172` zostávajú **UNACTIVATED** až do dohodnutého preflightu po kroku 8/8.
- **PR #1437 zostáva Draft**, neaktivovať na produkcii ani pri čiastočne zelenom CI. Finálny audit musí zahrnúť Notion ↔ D1 ↔ Admin ↔ verejný web a potvrdenie zhody dát po bežných synchronizačných cykloch.
