# PSIPEDIA.SK — Bod 2: Formuláre a ovládanie

**PR:** #1056; podkladom sú audit bodu 1 a merged #1040. Rozsah: zjednotiť iba funkčne porovnateľné implementácie. Žiadne API, D1, R2, Notion/Gemini ani vizuálne zmeny.

| Nahradená lokálna implementácia | Spoločný komponent / kontrakt | Čo zostáva zachované |
| --- | --- | --- |
| Pomoc psom: native confirm pri DELETE | `AdminDestructiveConfirmDialog`, `AdminActionButton` | `DELETE /api/admin/help/{id}`, refresh až po úspechu a zrušenie bez odoslania |
| Services V3: native confirm archivácie | `AdminDestructiveConfirmDialog` | `PATCH /api/admin/service-catalog/options/{id}`, `action: retire`, `expectedVersion`; väzby profilov ostávajú |
| Services V3: druhý native confirm v akcii „Zrušiť“ | Existujúci `EditorWorkspace` dirty guard; voliteľná funkcia `actions(requestClose)` | Bez úprav editor closes, dirty editor otvorí existujúce potvrdenie. Starí volajúci `actions` ako ReactNode zostali kompatibilní |
| Services V3: lokálne úspešné/chybové hlásenie | `AdminFormFeedback` | Pôvodné výstupy a serverová validácia |
| Partner podujatia: lokálny confirm/buttons/feedback | Spoločný confirm/action/feedback | `PATCH /api/admin/partners/events/{id}`, action/canonicalId/applyImage/reasonCode |
| Automatizačné findings: tri native confirm a lokálne akčné tlačidlá | Spoločný confirm/action/feedback | `PUT /api/admin/automation-findings/{id}`, reviewer notes, suppressedDays a iba draft koncepcia |
| Kvalita údajov: native confirm zamietnutia jedného poľa | Spoločný confirm | `POST /api/admin/automation-update-suggestions/.../fields/{field}`, hash aj expectedUpdatedAt |
| Chýbajúce údaje: natívny hromadný confirm a lokálne výpisy stavov | Shared confirm/feedback/action buttons, snapshot viditeľných ID | Pôvodné POST dávky po 200, žiadna požiadavka po Zrušiť/Escape |
| Šteniatka: lokálny `EditorActionBar.message` | `EditorActionBar.feedback` a `AdminFormFeedback` | `PUT /api/admin/sections`, dirty, úspech a chyba |

**Výnimky:** nie každý natívny button je duplicitou. Filtračné taby a špecifické inputy ostávajú; nesú rovnaké doménové hodnoty. Unsaved guard pre prepnutie časti filtrov Adresára nepredstavuje to isté ako opustenie editora.

**Regresné kontrakty:** `tests/admin-form-control-unification-point-2.test.mjs`. Auditné CI je rozšírené o testy bodu 2. Ďalšie body plánu sa neupravovali týmto krokom.
