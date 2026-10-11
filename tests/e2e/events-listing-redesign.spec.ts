import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
const target = '/podujatia?q=phase3+zilinska&termin=vsetky&mesiac=2026-10';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('psipedia-cookie-consent', 'necessary')); });
async function openFilters(page: import('@playwright/test').Page) { const summary = page.locator('summary').filter({ hasText: 'Filtrovať' }); if (await summary.isVisible() && !await page.locator('details').getAttribute('open'))
    await summary.click(); }
test('complete D1 pagination and calendar counts survive beyond 250 results', async ({ page }) => {
    await page.goto(target);
    await expect(page.locator('[data-event-range]')).toContainText('1–12 z 601');
    await expect(page.locator('[data-event-card]')).toHaveCount(12);
    await expect(page.locator('[data-calendar-date="2026-10-15"]')).toHaveAttribute('data-count', '601');
    await page.getByRole('link', { name: 'Nasledujúca', exact: true }).click();
    await expect(page.locator('[data-event-range]')).toContainText('13–24 z 601');
    await expect(page.locator('[data-calendar-date="2026-10-15"]')).toHaveAttribute('data-count', '601');
    await page.locator('[data-event-card]').first().getByRole('link').click();
    await page.getByRole('link',{name:'← Späť na výsledky podujatí',exact:true}).click();
    await expect(page).toHaveURL(url=>url.searchParams.get('strana')==='2'&&url.searchParams.get('q')==='phase3 zilinska');
    await expect(page.locator('[data-event-range]')).toContainText('13–24 z 601');
    await page.goto(target + '&strana=51');
    await expect(page.locator('[data-event-range]')).toContainText('601–601 z 601');
    await expect(page.locator('[data-event-card]')).toHaveCount(1);
    await page.goto(target + '&strana=9999999');
    await expect(page.locator('[data-event-range]')).toContainText('601–601 z 601');
    await page.goto(target + '&zoradenie=najnovsie');
    await expect(page.locator('[data-event-card]').first()).toContainText('600');
    await page.locator('[data-calendar-date="2026-10-15"]').click();
    await expect(page.locator('[data-selected-day] li')).toHaveCount(12);
    await expect(page.locator('[data-selected-day]')).toContainText('z 601');
});
test('sidebar combines date bounds, location, region and canonical type, preserving search', async ({ page }) => {
    await page.goto(target + '&strana=2');
    await openFilters(page);
    const form = page.locator('[data-event-filters]');
    await form.getByLabel('Dátum od', { exact: true }).fill('2026-10-16');
    await form.getByLabel('Dátum do', { exact: true }).fill('2026-10-16');
    await form.getByLabel('Mesto / lokalita').fill('zilina');
    await form.getByLabel('Kraj', { exact: true }).selectOption('Žilinský kraj');
    await form.getByLabel('Výstavy', { exact: true }).check();
    await form.getByRole('button', { name: 'Zobraziť výsledky' }).click();
    await expect(page).toHaveURL(url => url.pathname === '/podujatia/vystavy' && !url.searchParams.has('strana') && url.searchParams.get('q') === 'phase3 zilinska');
    await expect(page.locator('[data-event-card]')).toHaveCount(1);
    await expect(page.locator('[data-event-card]')).toContainText('000');
    await expect(page.locator('[data-calendar-date="2026-10-16"]')).toHaveAttribute('data-count', '1');
    await page.getByRole('link', { name: 'Ukončené', exact: true }).click();
    await expect(page).toHaveURL(url => url.searchParams.get('od') === '2026-10-16' && url.searchParams.get('mesto') === 'zilina');
    await page.goto(target + '&od=2026-10-16&do=2026-10-15');
    await expect(page.getByRole('alert')).toContainText('Dátum od');
    await expect(page.locator('[data-event-card]')).toHaveCount(0);
    await page.goto(target + '&od=2026-02-31&region=bad&strana=bad');
    await expect(page.locator('[data-event-range]')).toContainText('z 601');
});
test('responsive grid, accessible mobile disclosure, full-card links and smart images', async ({ page }) => {
    for (const width of [320, 390, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(target);
        const cards = page.locator('[data-event-card]');
        const [first, second, third] = await cards.evaluateAll(nodes => nodes.slice(0, 3).map(node => node.getBoundingClientRect().toJSON()));
        if (width >= 1280) {
            expect(first!.y).toBe(second!.y);
            expect(first!.y).toBe(third!.y);
            const sidebar = await page.locator('aside[aria-label="Filtre podujatí"]').boundingBox();
            expect(sidebar!.x + sidebar!.width).toBeLessThan(first!.x);
            await expect(page.locator('[data-event-filters]')).toBeVisible();
        }
        if (width < 760) {
            expect(second!.y).toBeGreaterThan(first!.y);
            await expect(page.locator('[data-event-filters]')).toBeHidden();
            const toggle = page.locator('summary').filter({ hasText: 'Filtrovať' });
            await toggle.focus();
            await page.keyboard.press('Enter');
            await expect(page.locator('[data-event-filters]')).toBeVisible();
            await toggle.click();
            await expect(page.locator('[data-event-filters]')).toBeHidden();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto(target + '&zoradenie=najblizsie');
    await expect(page.locator('[data-event-card] a a')).toHaveCount(0);
    await expect(page.locator('[data-event-card]').first().locator('a')).toHaveCount(1);
    await expect(page.locator('[data-event-card]').first().locator('img')).toHaveAttribute('data-smart-image-fit', 'contain');
    await expect(page.locator('[data-event-card][data-event-status=cancelled]')).toContainText('Zrušené');
    await expect(page.locator('[data-event-card][data-event-has-image="false"]')).toHaveCount(11);
    for (const card of await page.locator('[data-event-card]').all()) {
        const label = await card.locator('h3').textContent();
        expect(label).toBeTruthy();
        const type = card.locator('span').filter({hasText:/^(Výstavy|Preteky|Semináre|Tréningy|Stretnutia|Ostatné)$/}).last();
        const typeLabel = await type.textContent();
        const legendColor = await page.locator('[data-events-legend]').getByRole('link',{name:typeLabel!,exact:true}).locator('[data-event-type]').evaluate(el=>getComputedStyle(el).backgroundColor);
        expect(await type.evaluate(el=>getComputedStyle(el).borderLeftColor)).toBe(legendColor);
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await page.locator('[data-event-card]').first().locator('img').click();
    await expect(page).toHaveURL(/\/podujatia\/listing-phase3-0$/);
    await expect(page.getByRole('heading',{level:1})).toContainText('Phase3 ŽILINSKÁ výstava 000');
});
test('native filtering works with JavaScript disabled and canonical SEO stays intact', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(target);
    const form = page.locator('[data-event-filters]');
    await expect(form).toBeVisible();
    await form.getByLabel('Mesto / lokalita').fill('Martin');
    await form.getByLabel('Mesto / lokalita').press('Enter');
    await expect(page.locator('[data-event-range]')).toContainText('z 300');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://psipedia.sk/podujatia');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    await context.close();
});
