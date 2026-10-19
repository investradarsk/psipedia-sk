# PSIPEDIA — Public Visual Screenshots V1

Read-only screenshot recorder for the real production site **https://psipedia.sk**. Uses the existing `@playwright/test` Chromium dependency; it does not build or deploy the website, run D1 migrations, authenticate, change cookie consent, or submit forms.

## Run after an approved merge

1. Go to **GitHub → investradarsk/psipedia-sk → Actions**.
2. Select **PSIPEDIA — Public Visual Screenshots**.
3. Click **Run workflow**, choose branch **main**, and select **page**:
   - `homepage` (default), or an individual public route: `adresar`, `plemena`, `podujatia`, `pomoc-psom`, `clanky`, `steniatka`, `starostlivost`, `aktivity`, `recenzie`, `mapa`.
   - `core`: homepage, address directory, breeds, events and help.
   - `content`: articles, puppies, care, activities, reviews.
   - `all`: every allowed public page. This takes longer.
4. Open the completed workflow run, scroll to **Artifacts**, and download `psipedia-public-visual-screenshots-<run-id>-<attempt>` (available for 14 days).
5. Unzip the archive, then give the PNGs and reports to **Riadiace centrum 1 — Vizuál verejnej stránky**.

**Draft PR limitation:** GitHub typically only shows a newly introduced `workflow_dispatch` workflow after it exists on the default branch. The workflow also has a narrowly scoped `pull_request` trigger: on the Draft PR, it tests the code and captures **homepage only** using the PR revision, without waiting for merge. This avoids triggering the large existing Playwright E2E workflow on purpose.

## Artifact

```text
screenshots/
  homepage/
    mobile-320-viewport.png
    mobile-320-full.png
    mobile-375-viewport.png
    mobile-375-full.png
    mobile-390-viewport.png
    mobile-390-full.png
    mobile-430-viewport.png
    mobile-430-full.png
    tablet-768-viewport.png
    tablet-768-full.png
    desktop-1440-viewport.png
    desktop-1440-full.png
reports/
  manifest.json
  summary.md
```

Each additional page receives its own `screenshots/<page>/` folder. Screenshots are PNG at native CSS-pixel viewport size (`deviceScaleFactor: 1`) and full-page length, not downscaled.

The manifest captures the requested and final URL, document HTTP status, viewport dimensions, scroll/client widths, overflow pixels, document height, footer coverage, font readiness, lazy-scroll completion, image totals/unloaded/broken/non-rendered counts, failed image network requests, blocked write requests, PNG paths and pixel sizes, and per-viewport errors. Failures are isolated so subsequent viewports continue. A broken image or overflow marks the result **warning**; failed screenshot capture or HTTP error marks it **failed** (nonzero exit code).

## Loading and safety policy

- Each viewport uses a fresh anonymous Chromium context, with **no preset cookie consent**. The original cookie banner remains visible as delivered by production. No CSS overrides, element removal, or scripted clicks are used.
- The initial viewport is captured after DOM initialization, font readiness, and an above-the-fold image wait.
- The recorder scrolls incrementally to the bottom to activate lazy loading, checks image completion, returns to the top, then captures the full page. It validates that the PNG reaches the detected footer.
- Main-frame navigation is restricted to the exact `https://psipedia.sk` origin. Selectable paths are an explicit static allowlist; arbitrary URLs and admin/partner pages are unsupported.
- All non-GET/HEAD browser requests are aborted and service workers are disabled so they cannot bypass interception. External fonts/images and other read-only assets may still load as they would in the public browser. The recorder does not click buttons, submit forms or call Notion/Gemini/D1 APIs.
- No secrets are provided to the job. It has only `contents: read` GitHub permissions and a bounded job timeout. Failure diagnostics are still uploaded through `if: always()`.

## Limitations

- A browser image is not an authenticated admin screenshot or a substitute for manually reviewing UX. Screenshot success does **not** imply design approval.
- Browser automation uses a fresh session. Returning visitors who previously accepted cookies may see a different banner state.
- `all` includes pages with long content or map tiles, so total execution time and output size are higher. The workflow's 90-minute time limit and per-navigation/screenshot timeouts bound the run.
- CSS background assets do not appear in the HTML `<img>` error counters, though their rendered pixels are visible in screenshots.
- The recorder never forces consent, disables animations by custom CSS, or changes production data. The blocked-write policy can prevent optional interactive client-side widgets from fully initializing; such discrepancies should be read in conjunction with the manifest.

## Local developer check (optional)

```bash
npm ci
node --test tests/public-visual-screenshots.test.mjs
npx playwright install chromium
VISUAL_PAGE=homepage node scripts/public-visual-screenshots.mjs
```

Runtime output defaults to `.e2e-artifacts/public-visual-screenshots` locally and `public-visual-output` inside Actions. Changes to the allowlist require code review; Actions never accepts a URL field.
