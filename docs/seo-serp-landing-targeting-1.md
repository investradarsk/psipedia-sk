# SEO-SERP-LANDING-TARGETING-1 — audit a query → landing mapping

Audit baseline: main 07730b521bfe5ff92f1d0cc8e9b0f9f5d17e2f17, 8. 10. 2026. Scope: verejná homepage, category listings, anchors a regresie. Toto nie je audit aktuálneho Google rankingu ani historického SEO incidentu.

## Zistenia (zdroj kódu a verejne extrahovaný HTML obsah)

- Homepage: app/page.tsx poskytuje absolútny brand title, self-canonical cez buildPageMetadata, WebSite/Organization JSON-LD a H1 „Rozumej svojmu psovi“. Pôvodný opis META a úvodný hero text boli všeobecné. Service cards mali susedné prvky strong(category.label) a span(category.description) bez textového oddeľovača. Extrakcia verejnej homepage reálne produkovala „SalónyÚprava...Hotely a opatrovanieUbytovanie...“.
- Directory root: /adresar má vlastný buildListingPageMetadata, self-canonical, index/follow a CollectionPage/BreadcrumbList/ItemList schema. SSR ukážky kategórií sú linkované na existujúce URL. Nie je potrebný nový route.
- Directory category: app/adresar/[category]/page.tsx generuje unikátne title a opis cez directoryCategoryListingMetadata. Na čistom URL má self-canonical, index/follow, CollectionPage + BreadcrumbList; filtrované dopyty zostávajú noindex/follow, stránkovanie podľa existujúcej politiky. Intro je v lib/directory.ts. Runtime getSectionHeroVisual však umožňoval admin-managed heroContent.title nahradiť H1 kratším labelom („Salóny“). V rámci tohto PR je iba na category landingoch H1 a úvod odvodený od jednoznačného SEO slovníka; ostatné nastavenia hero a vizuály ostávajú zachované.
- Help root /pomoc-psom: špecifické metadata a CollectionPage/BreadcrumbList. Kategóriové stránky majú individuálne metadata. Katalóg adopcií, stratené/nájdené psy a kategórie pomoci sa nesmú zlievať do homepage. Legacy aliasy/redirecty ostali zachované.
- Verejné HTML a metadata skontrolované na stránkach /, /adresar/salony-a-sluzby, /adresar/veterinari, /adresar/treneri a /pomoc-psom/utulky. SEO výsledky Google môžu vytvárať vlastné title/snippet bez garancie.

## Preferred search intent → existujúce URL

| Search intent | Preferovaná URL |
| --- | --- |
| psie salóny; salón pre psa; grooming | /adresar/salony-a-sluzby |
| veterinár; veterinárna ambulancia | /adresar/veterinari |
| tréner psov; psia škola; výcvik psov | /adresar/treneri |
| kynologický klub; cvičisko | /adresar/kynologicke-kluby |
| chovateľský klub | /adresar/chovatelske-kluby |
| chovateľská stanica | /adresar/chovatelske-stanice |
| hotel pre psov; opatrovanie psa | /adresar/hotely-a-opatrovanie |
| venčenie psov | /adresar/vencenie |
| fyzioterapia pre psov | /adresar/fyzioterapia |
| ďalšie služby pre psov | /adresar/dalsie-sluzby |
| všetky služby pre psov | /adresar |
| psy na adopciu; adopcia psa | /pomoc-psom/adopcia |
| útulky a pomoc organizáciám | /pomoc-psom/utulky |
| dočasná opatera psa | /pomoc-psom/docasna-opatera |
| zbierky na pomoc psom | /pomoc-psom/zbierky |
| stratené a nájdené psy (rozcestník) | /pomoc-psom/stratene-a-najdene |
| stratený pes; stratené psy | /pomoc-psom/stratene-psy |
| nájdený pes; nájdené psy | /pomoc-psom/najdene-psy |
| ako pomôcť psom; dobrovoľníctvo | /pomoc-psom/dobrovolnictvo |
| všeobecný brand Psipedia; informácie o psoch | / |

## Scope a bezpečnostná hranica

- Zmeny: site-level homepage description/lead, semantické oddeľovanie názvu a opisu služieb v SSR, viditeľnejší category-specific anchor, stabilný H1 a intro adresárových kategórií aj pri D1-managed hero texte; regresné testy.
- Bez zásahu: robots.txt, canonical architektúra, sitemap, index/noindex politika, URL routing, profily, admin, produkčná D1, Cloudflare, SEO incident a Google Search Console. data-nosnippet nebol potrebný.
- Riziko paralelnej práce: app/page.tsx a components/directory-page.tsx patria do verejných listingov; nie do detailu profilov, mapy ani admin navigácie. Pred merge preveriť zmenené súbory ďalších PR a dostupné CI.
- Otvorené overenie: po nasadení overiť finálne SSR zdroje vrátane admin-managed H1 a sledovať SERP bez hromadných reindexácií. Výber výsledku aj snippetu určuje Google.
