# PSIPEDIA — SERVICES V3, Phase 1: Admin-owned shared catalog
## Owner-approved governance
- New catalog options are created **exclusively in Psipedia Admin** by an authenticated authorized owner/admin. Notion is a **read-only mirror for canonical options**: every new Admin-approved option must be synchronized with the same stable ID. Notion must not mint, rename, delete, or overwrite options. Gemini and partners may propose but not create.
- Original static `lib/service-catalog-contract.ts` remains the **single approved seed catalog**, extended from V0.2 to V0.3. Dynamic Admin-created options will live in canonical D1 with immutable server-created IDs. No second independent Notion catalog or public registry.
- Only **Áno/Nie** selection controls in Admin. Untouched/missing legacy profile values are unknown in storage, **never** automatic No. A human must explicitly choose No.
- Veterinary expertise != procedure or formal specialization credential. Generic surgery != specific procedure. `Príprava na skúšky` != preparation for every exam. Explicit exam families required; unknown families not inferred.
- Existing 65 `svc.*`, 26 `attr.*`, 2 `provider.*`, 21 legacy facet mappings and semantic meanings remain unchanged.

## Delivered in this isolated Draft PR
- V0.3 single catalog: **91 services, 28 attributes, 2 provider types**.
- Added concrete vet exams/procedures: eyes, joints, dysplasia, ECHO, dental cleaning, extraction, dental x-ray, laparoscopy; multi-select veterinarian focus areas distinct from procedures.
- Added trainer/club options: recall, leash work, handling solitude, reactivity, social walks, hunting/rescue training, shared obedience, hoopers, flyball, dogfrisbee, dogdancing, canicross, mantrailing and bikejoring.
- Explicit exam family field, never automatic 'all'; additional grooming dematting, dog care pickup and physio therapeutic massage.
- Added **pure draft validation and declarative governance** in `lib/service-option-governance-contract.ts`; NOT a live Admin API/button or security authorization boundary. Added CI contract tests.

## Phases after owner approval
2. Canonical D1 dynamic options and per-profile values, authenticated Admin-only create/approve/update API with immutable IDs, CAS, version/audit, staged safe migrations. Notion cannot create options.
3. Separate owner-approved Admin Visual System V3-compatible UI: compact grouped choices, search, **+ Vytvoriť novú možnosť** only for Admin; show Áno/Nie, leave old unknown unselected. Partner proposals require Admin approval.
4. Choose Notion representation, mirror D1 canonical option IDs and profile values to Notion, detect drift, block Notion option additions and incoming option overrides.
5. Controlled explicit-only historical migration, unified public profiles/filter/map using canonical IDs; coordinate untouched Draft PR #864.
6. E2E integration, smoke, owner-controlled merges/rollout, final handover report.

## Explicit exclusions
No live UI change, API writer, D1 migration/data writes, Notion schema/write, Gemini call, live filter/map, production deploy or merge in phase 1. **Leave existing PR #864 Draft and untouched.** The draft validator cannot replace real authenticated server-side authorization.
