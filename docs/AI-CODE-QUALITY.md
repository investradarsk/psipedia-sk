# Jednotné pravidlá kvality kódu (AI a ľudia)

Autoritatívne pravidlá pre implementáciu sú v koreňovom [AGENTS.md](../AGENTS.md). Táto príloha vysvetľuje zavádzanie bez hromadného prepisovania legacy zdrojov.

## Pred každou úlohou
1. Porovnaj aktuálny `main` a existujúce PR. Vytvor samostatnú pracovnú vetvu, jeden tematický Draft PR a checklist.
2. Nájdi existujúce implementácie rovnakého správania a úlohu rozšír v kanonickom module.
3. Zachovaj správanie API, bezpečnostné pravidlá, D1 schému a existujúce oprávnenia.
4. Pri oprave chyby pridaj regresný test; vykonaj relevantné testy a uveď ich stav v PR.

## Prettier (postupné zavádzanie)
Konfigurácia `.prettierrc.json` definuje jednotné formátovanie. Pri úprave používaj napríklad:

```sh
npx --yes --package=prettier@3.6.2 prettier --write lib/upravovany-subor.ts tests/suvisiaci-test.mjs
npx --yes --package=prettier@3.6.2 prettier --check lib/upravovany-subor.ts tests/suvisiaci-test.mjs
```

Formátuj iba súbory, ktoré sú skutočne súčasťou práce. Nie celý repozitár: historické preformátovanie vytvára konflikty a zakrýva funkčné zmeny. Prettier je teraz pripnutý vo vývojovom príkaze, nie pridaný do produkčných závislostí. Pri ďalšom plánovanom obnovení `package-lock.json` ho možno zaradiť medzi devDependencies.

## Kanonické hranice
- Admin write: `requireAdminMutation` a `rejectUntrustedAdminMutationOrigin`; rozdielne režimy pôvodu musia byť explicitné a testované.
- Partner write: zachovať kontrolu prihlásenia, presný Origin, JSON obsah a limity pokusov.
- Push: kategorizácia `admin-automation-push-policy.ts`; notifikačný modul iba doručuje.
- Chyby API: Slovenské `{error}` bez interných detailov; pri dotknutých routach zachovať HTTP status.
- D1: nikdy nepoužiť `drizzle-kit generate`; len kontrolované SQL migrácie.

## Akceptácia
PR má tematický rozsah, checklist, otestované zmeny a žiadny merge či deploy bez manuálneho schválenia.
