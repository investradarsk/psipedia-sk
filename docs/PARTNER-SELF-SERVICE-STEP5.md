# Psipedia Partner – krok 5/8: spoločné editory schválených záznamov

## Cieľ a pravidlá

Partner spravuje iba kanonický záznam, ku ktorému mu administrátor schválil prístup. Jeden partner môže spravovať viac záznamov, ale každý záznam má najviac jedného aktívneho externého správcu. Po prvotnom schválení majú byť verejné úpravy samoobslužné, bez opakovanej moderácie; SEO, interné kontrolné polia, systémové ID, zmazanie a súkromné kontakty ostávajú administrácii.

## Čo je implementované v kroku 5

- Existujúce editory pre Služby, organizácie a podujatia zostávajú zachované, bez klonovania admin formulárov.
- Pre tri samostatné Help oblasti (`ADOPTION_DOG`, `LOST_FOUND_DOG`, `HELP_CASE`) pribudol **jeden spoločný typovaný editor** na `/partner/pomoc/[resourceId]/upravit` s existujúcim `PartnerShell`, spoločnými štýlmi formulárov a mediálnymi ovládačmi.
- Sada polí `lib/partner-help-editor-fields.ts` slúži UI i serverovej validácii. Nikdy nepovoľuje SEO, slug, status, interné overenie, publikačné metadata, technické ID ani súkromné geolokačné údaje. Každý typ používa skutočné stĺpce svojej kanonickej D1 tabuľky; žiadna ďalšia kópia profilu.
- Schválený aktívny správca má iba verejné Help oprávnenie `HELP_EDIT_PUBLIC`. Autorizácia pre čítanie aj zápis zahŕňa partner session, dokončený onboarding pre mutáciu, vlastníctvo a stav účtu. UPDATE opätovne overuje aktivitu schválenej `partner_help_claims` väzby **v tej istej SQL podmienke**, takže odvolaný prístup nemôže uložiť zmenu.
- Save API `PATCH /api/partner/help-records/[resourceId]` používa allowlist, základnú verziu `updated_at`, parametrizované SQL a zápis iba odoslaných zmien. Nesúvisiace polia sa neprepisujú. Zápis udalosti do existujúceho append-only `partner_audit_events` používa existujúcu akciu `PROFILE_CHANGE_APPROVED` s metadátami `DIRECT_PUBLIC_SAVE`; bez novej migrácie.
- Nové fotografie bezpečne prechádzajú existujúcim `/api/partner/media` a transformáciou do WebP. Voľba `PARTNER_HELP_UPDATE` je určená pre Help editor. Galéria je dostupná iba pre adopcie a stratené/nájdené psy (tabuľka `help_cases` nemá kanonickú galériu). Médiá sa pripnú k existujúcemu riadku, nikdy nevytvoria nový záznam.
- Dashboard aj Moje profily vedú na reálne dostupný editor po schválení Help claimu.

## Prechod na krok 6/8

Krok 5 poskytuje funkčný priamy zápis verejných Help polí do kanonickej D1; **zatiaľ nerobí celoplošný prechod Služieb a Podujatí z moderovaných návrhov na priamy zápis**. Tento prechod patrí do kroku 6 spolu so synchronizačnými/konfliktnými pravidlami D1 ↔ Notion, aktualizáciou cache a rovnakou politikou ukladania vo všetkých kategóriách. Do ich dokončenia nesmie byť táto rozpracovaná vetva nasadená do produkcie.

Navyše administrátorská moderácia úplne nových Help návrhov z kroku 4 zostáva úlohou kroku 7. Nový verejný profil sa nevytvorí ani nepublikuje odoslaním návrhu.

## Testy a migrácie

- `tests/partner-help-editor-step5.test.mjs`: allowlist, povolené polia, zamietnutie systémových/private údajov, oprávnenie, ochrana verzií, media flow a napojenie dashboardu.
- Regresie kroku 3 sa musia aktualizovať tak, aby už netvrdili, že schválený Help záznam nemá editor.
- D1 migrácie `0171` a `0172` zostávajú **UNACTIVATED**; nový kód používa vlastníctvo z `0172`. Pred akýmkoľvek produkčným nasadením overiť a manuálne aplikovať migrácie v dohodnutom poradí po úplnom dokončení krokov 1–8 a zelenom CI.
