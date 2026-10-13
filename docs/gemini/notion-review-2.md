# GEMINI-NOTION-REVIEW-2

Base main: `accb70e3d9f8e045bb77b78670003949d6c58170`.
PR #782 was merged (merge `f921d460fb5b888eed62c273031a7e39f74bca4d`). GitHub open-PR audit at the start returned no open PRs. No separate Sites checkout was present in this workspace.

## Merge dependency

During final delivery PR #787 reserved migration 0123 for ADDRESS-ADMIN-D1-3. This PR therefore uses 0124 and is stacked on `feat/address-admin-d1-3` at `f9a88c95c2d7beb21107cc83b0aa3c788fb1e586`. PR #788 targets main for the existing CI gates, but includes #787 as a prerequisite commit. Merge #787 first, verify/rebase #788 against that main if needed, recheck CI, then merge #788. Until #787 merges its seven files are also visible in the cumulative diff. No overlapping implementation files with #787 or #786. Production migration approval remains separate.

## Audited schema and lifecycle

Read-only inspection of the connected Adresár data source `84e0664c-ca47-405f-9d54-31b20287bc8c` on 2026-10-13 confirmed:

- `Stav`: Nápad, Na kontrolu, Ready, Publikované, Archív.
- `Psipedia stav`: Koncept, Publikované, Archív.
- Existing text fields: Poznámky, Upravil, Vytvoril, Psipedia ID.
- There is no Odmietnuté option. No live schema/page changes were made.

UI states project this existing lifecycle. Unreviewed drafts are Nový; a successful save adds an audit event and makes them Rozpracovaný. Approval sets both publication fields to Publikované and displays Schválený / čaká na synchronizáciu. Only an actual published D1 profile found through `directory_notion_sync` displays Publikovaný. Mapped non-public profiles display Importovaný koncept and open the canonical editor.

Rejection sets both existing selects to Archív. It does not archive/trash the Notion page itself. The page remains available to the worker's full database scan. Restore is an explicit separate action returning the same page to Na kontrolu / Koncept. Review operations refuse canonical records and approval cannot bypass rejection.

`Poznámky` is append-only for this workflow: existing prose is retained; each new line prefixed `[Psipedia Gemini review] ` contains action, timestamp, administrator, optional reason and pre-edit identity. This is audit/identity history, not a second status system. Notion select values remain authoritative. Schema compatibility is checked before writes; no unknown select option is created.

## Duplicate memory and sync

The external worker scans all rows, including rejected/archived concepts and published profiles. Before each directory creation it refreshes the snapshot and compares current and historical identities deterministically. Normalization handles accents, punctuation, company suffixes, www/http/https and ordinary contact-page/tracking URL variants. Changed URLs still match the same normalized name and town. Shared domains/names in different towns do not automatically collapse branches. Insufficient evidence is not treated as a guaranteed match; arbitrary rebrands with all identifiers changed remain a limitation.

No model calls are used for duplicate comparison. The existing global GitHub Actions worker concurrency remains unchanged. Event/help duplicate behavior is unchanged.

Gemini Notion-only pages import only when BOTH existing states are explicitly published. Rejected/unreviewed records are skipped before mapping recovery. Existing one-to-one mapping recovery is retained. Before canonical creation a deterministic duplicate check against D1 names/towns/websites runs under a directory import lock. Existing profiles are not overwritten on a match. A known duplicate releases its locks, displays the sync error, and the administrator can explicitly reject the still-unmapped approved page, restore and correct it. Rejection of an approval uses the same page lock as sync and refuses a profile already mapped in D1. Existing Notion page write-back no longer replaces Vytvoril, preserving Gemini origin after sync. It also leaves review notes untouched.

## Migration and concurrency

`drizzle/0124_gemini_notion_review_locks.sql` is an additive, independently applicable migration containing only a coordination table. It does not change profile data. It was NOT applied to production. Apply it through the established migration procedure only after explicit owner approval, before using the new mutation/import path. Read-only lists do not require this new table; writes fail closed if it is missing.

Admin writes take an atomic D1 page lock, check the submitted Notion revision, validate schema, re-read the revision immediately before PATCH, and send exactly one PATCH without transport retries. Sync acquires the same page lock and a shared import lock around duplicate-check/create/mapping. Page IDs are normalized so dashed/undashed IDs cannot bypass exclusion. Successful operations release only their own lock. A repeated rejection/approval/restore is a no-op when already in the requested final state; stale saves conflict instead of overwriting.

Notion does not expose compare-and-swap for page PATCH. The lock serializes this application's requests across Cloudflare isolates, not direct human edits in Notion; the second revision read narrows that external race. Operators should edit a concept in one editor at a time.

### Uncertain result recovery

Locks deliberately do not expire automatically after an uncertain transport/import error. Expiring a lock while a remote operation could still complete would permit conflicting writes or duplicate imports. A normal successful request does not require intervention.

If the UI reports a retained lock:

1. Read the lock's page ID/owner/created_at and confirm the originating request/run has ended. Never clear an active request's lock.
2. Fetch that same Notion page and inspect current states, notes and last_edited_time. For an uncertain import also inspect `directory_notion_sync` and any already-created canonical profile. Reconcile the existing profile/mapping; do not create another profile.
3. Only after establishing the final remote result, remove that specific lock by page ID AND observed owner using the normal approved D1 operator procedure. A failed import may also retain the `directoryimport` lock; reconcile and clear it by owner too.
4. Reload the UI. Retry only if the intended action has not already completed. Do not bulk-delete locks or enable retries of an uncertain import.

This PR neither runs that procedure nor changes AmyVet, the scheduler, live Notion data, or production migrations. Merge is manual.

## Validation

- Mocked transport tests: direct listing, original-page saves, manual publication, stale revision/foreign/canonical rejection, reject/restore/repeated actions, preserved audit, concurrent requests, schema mismatch and uncertain-write exclusion.
- Deterministic identity and state/count tests, including different-town and similar-name negative cases.
- SQLite migration/lock tests: repeat application, normalized IDs and owner-safe release.
- Real API handlers under an unauthenticated auth fixture: GET/PUT/PATCH/POST cannot contact Notion.
- Playwright component test: actual shared editor and modal at 390/1280 px; opening writes nothing; rejection with reason, filters, explicit restoration, save without publishing, no JS errors or horizontal overflow. All HTTP is intercepted, no live data/provider use.
- Existing worker contracts, directory sync contracts, targeted lint, migration safety, CI scope guard and production build.

After approved migration and merge: use a disposable non-AmyVet draft to save/reopen, reject/filter/inspect reason, restore, and explicitly approve. Check waiting-for-sync versus actual publication after the existing scheduled sync. Inspect canonical identity/page mapping and confirm the worker fixture rejects the archived identity. Do not trigger paid research solely for this smoke test.
