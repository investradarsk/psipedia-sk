# Production Stability & Network Recovery — step 5/7

Checkpoint: 1470d764deb2597f1a555397508de4c159275a76.

## Implementation

Reuse the pinned Vinext router transition hook and the existing 12-second navigation indicator budget. Only accepted transitions are tracked for recovery; click capture remains feedback-only. A stalled same-origin public-to-public or Partner-to-Partner transition offers a native document link in a new tab. New transitions replace old timers. Route commit, page hide/show, backgrounding, return to the committed route and dismiss clear pending recovery. External URLs, Admin/API endpoints, ambiguous encoded paths, RSC endpoints and same-route/hash-only transitions are excluded.

The user must initiate the document navigation; no automatic reload, automatic retry, fetch monkey patch, history changes or mutation replay. The old tab is not reloaded by this action (an already accepted router transition may still finish independently). Existing Admin recovery and dirty-editor/Partner guards remain unchanged.

A root segment error boundary offers deliberate reset with confirmation and a new-tab home link; it does not turn errors into not-found results or display raw server exceptions. Errors in the root layout itself are outside this segment boundary. Actual transport failure vs slow transition cannot be established by the watchdog alone.

## Verification

Four isolated Node 22 unit tests passed against exact recovery helper blob c4eda608675ebc4ad0f549dc95382067f03bf024 and test blob fcbe3fe522ed7ad5f0c06aca677ce9de16b7244c, using the existing 12000ms constant in the isolated harness. Tests cover destination policy, timer boundary, cleanup and stale timer invalidation. Added a Playwright scenario to the existing navigation-loading suite for a held RSC request, visible recovery and a native popup. Browser integration, full build/CI, formatting and exact PR revision screenshots have not been verified; required before review. No Notion, SQL migration, production deploy or mutations.

VISUAL_REVIEW_ROUTES: /adresar,/podujatia,/partner
