import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const ROOT = ".e2e-artifacts/public-ux-hardening";
const LANDINGS = [
  "/pomoc-psom",
  "/adresar",
  "/podujatia",
  "/steniatka",
  "/starostlivost",
  "/aktivity",
  "/plemena",
  "/recenzie",
  "/clanky",
] as const;

const QUICK_ROUTES = ["/pomoc-psom", "/adresar", "/podujatia", "/steniatka"] as const;
const QUICK_VIEWPORTS = [
  [320, 800],
  [360, 800],
  [375, 812],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 800],
] as const;

test.describe.configure({ mode: "parallel" });

type AuditRecord = {
  route: string;
  width: number;
  height: number;
  url: string;
  metrics: Awaited<ReturnType<typeof collectMetrics>>;
  accessibility: { id: string; impact: string | null; help: string; nodes: number }[] | null;
  interactions: unknown[];
  screenshot: string | null;
};

function safeId(route: string) {
  return route.replaceAll(/[^a-z0-9]+/gi, "_") || "home";
}

async function openRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 25_000 });
  expect(response?.status(), route).toBe(200);
  await expect(page.locator("main")).toBeVisible({ timeout: 12_000 });
  await page.evaluate(async () => {
    const fonts = document.fonts?.ready;
    if (!fonts) return;
    await Promise.race([
      fonts,
      new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
    ]);
  });
}

async function collectMetrics(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const box = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x * 10) / 10,
        y: Math.round(rect.y * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        bottom: Math.round(rect.bottom * 10) / 10,
      };
    };

    const hero = main.querySelector("[data-unified-section-hero]");
    const shell = main.querySelector("[data-unified-section-hero-shell]");
    const next = shell?.nextElementSibling ?? hero?.nextElementSibling ?? null;

    const controls = Array.from(main.querySelectorAll("input,select,button,[role='button'],a")).filter(visible);
    const searches = controls.filter((element) =>
      element.matches('input[type="search"],input[name="q"],input[name="hladat"]')
      || (element instanceof HTMLInputElement && /hľada|názov|plemeno|mesto|lokalita/i.test(element.placeholder)),
    );

    const links = Array.from(main.querySelectorAll("a[href]"));
    const ctas = links
      .filter((element) => /pridať|ako pridať|mapu|porovnať|napísať recenziu|profil/i.test(element.textContent ?? ""))
      .map((element) => ({
        text: element.textContent?.trim(),
        href: element.getAttribute("href"),
        box: box(element),
      }));

    const navs = Array.from(main.querySelectorAll("[data-public-subcategory-navigator]")).map((nav) => {
      const track = nav.querySelector("[data-public-subcategory-track]");
      const items = Array.from(nav.querySelectorAll("[data-public-subcategory-item]"));
      const trackBox = box(track);
      const secondBox = box(items[1] ?? null);
      return {
        mode: nav.getAttribute("data-public-subcategory-mode"),
        track: trackBox,
        count: items.length,
        current: nav.querySelector('[aria-current="page"]')?.textContent?.trim(),
        scrollWidth: track instanceof HTMLElement ? track.scrollWidth : null,
        partialNext: Boolean(
          trackBox
          && secondBox
          && secondBox.x < trackBox.x + trackBox.width
          && secondBox.x + secondBox.width > trackBox.x + trackBox.width,
        ),
        items: items.map((element) => ({
          text: element.textContent?.trim(),
          box: box(element),
          href: element.getAttribute("href"),
          tabIndex: (element as HTMLElement).tabIndex,
        })),
      };
    });

    const touchTargets = Array.from(
      main.querySelectorAll("button,input,select,[role='button'],[data-public-subcategory-item]"),
    )
      .filter(visible)
      .map((element) => ({ text: element.textContent?.trim().slice(0, 80), tag: element.tagName, box: box(element) }))
      .filter((item) => item.box && item.box.height < 44);

    const images = Array.from(main.querySelectorAll("img")).map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        src: image.getAttribute("src"),
        alt: image.alt,
        loaded: image.complete && image.naturalWidth > 0,
        broken: image.complete && Boolean(image.getAttribute("src")) && image.naturalWidth === 0,
        nearViewport: rect.top < window.innerHeight * 2,
        box: box(image),
      };
    });

    return {
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      h1: Array.from(main.querySelectorAll("h1")).map((element) => ({ text: element.textContent, box: box(element) })),
      hero: box(hero),
      next: box(next),
      gap: hero && next ? Math.round((next.getBoundingClientRect().top - hero.getBoundingClientRect().bottom) * 10) / 10 : null,
      searches: searches.map((element) => ({
        label: element.getAttribute("aria-label"),
        placeholder: element.getAttribute("placeholder"),
        box: box(element),
      })),
      navs,
      legacyNavs: main.querySelectorAll("[data-public-category-tiles],.section-tabs-inner").length,
      banners: Array.from(main.querySelectorAll("[data-public-context-banner]")).map(box),
      ctas,
      touchTargets,
      images,
      brokenVisibleImages: images.filter((image) => image.broken && image.nearViewport),
      links: links.map((element) => ({ href: element.getAttribute("href"), text: element.textContent?.trim() })),
      headings: Array.from(main.querySelectorAll("h1,h2,h3")).map((element) => ({ tag: element.tagName, text: element.textContent })),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      robots: document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    };
  });
}

function pickRepresentative(record: AuditRecord | undefined, root: string, fallback?: string) {
  if (!record) return fallback ?? null;
  const navHref = record.metrics.navs
    .flatMap((nav) => nav.items)
    .map((item) => item.href)
    .find((href): href is string => Boolean(href?.startsWith(`${root}/`) && !href.includes("?")));

  if (navHref) return navHref;

  const linked = record.metrics.links
    .map((item) => item.href)
    .find((href): href is string => {
      if (!href?.startsWith(`${root}/`) || href.includes("?")) return false;
      const depth = href.split("/").filter(Boolean).length;
      return depth === root.split("/").filter(Boolean).length + 1 && !/pridat|kalendar/i.test(href);
    });

  return linked ?? fallback ?? null;
}

async function auditRoute(
  page: Page,
  route: string,
  width: number,
  height: number,
  options: { axe: boolean; screenshot: boolean },
): Promise<AuditRecord> {
  await page.setViewportSize({ width, height });
  await openRoute(page, route);

  const metrics = await collectMetrics(page);
  const accessibility = options.axe
    ? (await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze())
      .violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.length,
      }))
    : null;

  const interactions: unknown[] = [];
  const toggles = page.locator('main button[aria-expanded]').filter({ hasText: /Filtre/ });
  for (const toggle of await toggles.all()) {
    if (!await toggle.isVisible()) continue;
    const before = await toggle.getAttribute("aria-expanded");
    await toggle.click();
    interactions.push({
      label: await toggle.innerText(),
      before,
      after: await toggle.getAttribute("aria-expanded"),
      controls: await toggle.getAttribute("aria-controls"),
    });
    await toggle.click();
  }

  const current = page.locator('main [data-public-subcategory-mode="compact"] [aria-current="page"]');
  if (await current.count()) {
    await current.first().focus();
    interactions.push({
      currentFocus: await current.first().evaluate((element) => element === document.activeElement),
      focusedBox: await current.first().boundingBox(),
    });
  }

  const screenshot = options.screenshot ? `${ROOT}/${width}-${safeId(route)}.png` : null;
  if (screenshot) {
    await page.screenshot({
      path: screenshot,
      fullPage: true,
      animations: "disabled",
      timeout: 20_000,
    });
  }

  const record = { route, width, height, url: page.url(), metrics, accessibility, interactions, screenshot };
  writeFileSync(`${ROOT}/${width}-${safeId(route)}.json`, JSON.stringify(record, null, 2));
  console.log(
    `AUDIT ${route} ${width} overflow=${metrics.scrollWidth - metrics.width} searches=${metrics.searches.length} axe=${accessibility?.length ?? "not-run"}`,
  );
  return record;
}

async function runCoreAudit(page: Page, width: number, height: number, label: string) {
  mkdirSync(ROOT, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));

  const records: AuditRecord[] = [];
  const failures: string[] = [];

  for (const route of LANDINGS) {
    try {
      records.push(await auditRoute(page, route, width, height, { axe: true, screenshot: true }));
    } catch (error) {
      failures.push(`${route}@${width}: ${String(error)}`);
      await page.screenshot({
        path: `${ROOT}/${width}-${safeId(route)}-error.png`,
        fullPage: false,
      }).catch(() => undefined);
    }
  }

  const reps = [
    pickRepresentative(records.find((record) => record.route === "/adresar"), "/adresar", "/adresar/veterinari"),
    pickRepresentative(records.find((record) => record.route === "/podujatia"), "/podujatia", "/podujatia/vystavy"),
    pickRepresentative(records.find((record) => record.route === "/steniatka"), "/steniatka"),
    pickRepresentative(records.find((record) => record.route === "/pomoc-psom"), "/pomoc-psom"),
  ].filter((route): route is string => Boolean(route));

  for (const route of [...new Set(reps)]) {
    try {
      records.push(await auditRoute(page, route, width, height, { axe: false, screenshot: false }));
    } catch (error) {
      failures.push(`${route}@${width}: ${String(error)}`);
    }
  }

  writeFileSync(
    `${ROOT}/${label}-summary.json`,
    JSON.stringify({ records, failures }, null, 2),
  );
  expect(failures, `${label} routes must render; see preserved evidence`).toEqual([]);
}

test("PUBLIC-UX-HARDENING core landing audit — mobile 390", async ({ page }) => {
  test.setTimeout(12 * 60 * 1000);
  await runCoreAudit(page, 390, 844, "core-mobile");
});

test("PUBLIC-UX-HARDENING core landing audit — desktop 1440", async ({ page }) => {
  test.setTimeout(12 * 60 * 1000);
  await runCoreAudit(page, 1440, 900, "core-desktop");
});

test("PUBLIC-UX-HARDENING responsive geometry sweep", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  mkdirSync(ROOT, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));

  const records: AuditRecord[] = [];
  const failures: string[] = [];

  for (const [width, height] of QUICK_VIEWPORTS) {
    for (const route of QUICK_ROUTES) {
      try {
        records.push(await auditRoute(page, route, width, height, { axe: false, screenshot: false }));
      } catch (error) {
        failures.push(`${route}@${width}: ${String(error)}`);
      }
    }
  }

  writeFileSync(
    `${ROOT}/responsive-summary.json`,
    JSON.stringify({ records, failures }, null, 2),
  );
  expect(failures, "responsive sweep routes must render; see preserved evidence").toEqual([]);
});
