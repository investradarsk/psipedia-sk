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
    await expect(page.locator('[data-event-card]').first().locator('img[data-event-image-source]')).toHaveAttribute('data-smart-image-fit', 'contain');
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
    await page.locator('[data-event-card]').first().locator('img[data-event-image-source]').click();
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

test.describe('final events acceptance', () => {
  const finalTarget='/podujatia?termin=vsetky&q=finalaudit&kalendar=2026-10';
  test.beforeEach(async ({page}) => {
    await page.route('**/__e2e/*.svg', route => route.fulfill({contentType:'image/svg+xml',body:route.request().url().includes('portrait')
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000"><rect width="600" height="1000" fill="#173f35"/><circle cx="300" cy="350" r="160" fill="#ea8732"/><path d="M100 850L300 550L500 850" fill="#f2ecd9"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="white"/><circle cx="500" cy="300" r="100" fill="#258453"/></svg>'}));
  });
  test('viewport matrix, mixed media, calendar indicators and accessibility', async ({page}, info) => {
    const mobile=info.project.name.includes('mobile');
    const sizes=mobile?[[320,700],[375,812],[390,844],[430,932],[700,320]]:[[768,1024],[1024,768],[1280,800],[1440,900],[1920,1080]];
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    for(const [width,height] of sizes) {
      await page.setViewportSize({width,height});await page.goto(finalTarget);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('input[name=q]:not([type=hidden])')).toHaveCount(1);
      await expect(page.locator('[data-event-card]')).toHaveCount(12);
      expect(await page.locator('[data-event-list]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width>=1280?3:width>=1024?2:1);
      await expect(page.locator('[data-event-card] img').first()).toHaveAttribute('loading','lazy');
      await page.locator('[data-event-card] img').evaluateAll(images=>images.forEach(image=>(image as HTMLImageElement).loading='eager'));
      await expect.poll(()=>page.locator('[data-event-card] img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
      // The default list order depends on today's Bratislava date, not viewport.
      // Inspect specific image fixtures after the viewport loop using stable names.
      await expect(page.locator('[data-event-card] img[data-event-image-source]')).toHaveCount(12);
      const indicators=await page.locator('[data-calendar-date="2026-10-11"]').evaluate(element=>{
        const box=element.getBoundingClientRect(),spans=element.firstElementChild!.children;
        const first=spans[0].getBoundingClientRect(),count=spans[1].getBoundingClientRect();
        const dots=element.lastElementChild!.getBoundingClientRect();
        return {overlap:first.right>count.left,outside:count.right>box.right||dots.bottom>box.bottom,width:box.width,height:box.height};
      });
      expect(indicators.overlap).toBe(false);expect(indicators.outside).toBe(false);expect(indicators.width).toBeGreaterThanOrEqual(24);expect(indicators.height).toBeGreaterThanOrEqual(44);
      const banner=await page.locator('[data-public-context-banner]').boundingBox();expect(banner!.height).toBeLessThanOrEqual(width>760?170:260);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:info.outputPath(`final-events-${width}.png`),fullPage:true});
    }
    await page.goto(finalTarget+'&zoradenie=najblizsie');
    const fixtureCard = (title:string) => page.locator('[data-event-card]').filter({has:page.getByRole('heading',{name:title,exact:true})});
    // These cards may be below the mobile fold. Trigger native lazy loading before
    // asserting the client-side fit, which depends on decoded image dimensions.
    for (const title of ['Finalaudit Preteky 1', 'Finalaudit Seminár 2']) {
      const image = fixtureCard(title).locator('img[data-event-image-source]');
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(image).toHaveAttribute('data-smart-image-fit', 'contain');
    }
    await expect(fixtureCard('Finalaudit Preteky 7')).toContainText('Online podujatie');
    await expect(page.getByRole('heading',{name:/Mimoriadne dlhý názov kynologického stretnutia/})).toBeVisible();
    const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
    expect(errors).toEqual([]);
  });
  test('native filters exclude hidden inputs from focus and submissions reveal results below the header', async ({page},info) => {
    await page.goto(finalTarget);
    const input=page.locator('[data-event-filters] input[name=mesto]');
    if(info.project.name.includes('mobile')) {
      const summary=page.locator('summary').filter({hasText:'Filtrovať'});
      await expect(input).toBeHidden();expect(await input.evaluate(el=>{(el as HTMLInputElement).focus();return document.activeElement===el;})).toBe(false);
      await summary.focus();await page.keyboard.press('Enter');await expect(input).toBeVisible();
      await input.focus();await expect(input).toBeFocused();
      await summary.focus();await page.keyboard.press('Enter');await expect(input).toBeHidden();
      await page.keyboard.press('Tab');expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('[data-event-filters]')))).toBe(false);
      await summary.click();
    }
    await input.fill('Žilina');await page.getByRole('button',{name:'Zobraziť výsledky',exact:true}).click();
    await expect(page).toHaveURL(url=>url.searchParams.get('mesto')==='Žilina'&&url.hash==='#events-list'&&!url.searchParams.has('strana'));
    await expect(page.locator('[aria-label="Aktívne filtre"]')).toContainText('Lokalita: Žilina');
    await expect.poll(()=>page.locator('#events-list').evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(90);
    await expect(page.getByRole('link',{name:'Pridať podujatie',exact:true})).toHaveAttribute('href','/podujatia/pridat-podujatie');
  });
  test('detail return preserves page, category, filters and selected calendar day', async ({page}) => {
    for(const path of [target+'&strana=2',target.replace('/podujatia?','/podujatia/vystavy?')+'&strana=2',target+'&den=2026-10-15']) {
      await page.goto(path);const before=new URL(page.url());
      // The return URL is stored by a client-side effect; wait for hydration.
      await expect.poll(()=>page.evaluate(()=>{try{return JSON.parse(sessionStorage.getItem('psipedia:events:last-listing')||'null')?.href ?? null;}catch{return null;}}))
        .toBe(before.pathname+before.search+before.hash);
      await page.locator('[data-event-card]').first().getByRole('link').click();await expect(page.locator('[data-event-image] img[data-event-image-source]')).toBeVisible();
      await expect(page.locator('.site-header [data-search-ready]')).toHaveAttribute('data-search-ready','true');
      await page.getByRole('link',{name:'← Späť na výsledky podujatí',exact:true}).click();
      await expect(page).toHaveURL(url=>url.pathname===before.pathname&&url.search===before.search);
    }
    await page.goto(finalTarget);await page.locator('[data-event-card]').first().getByRole('link').click();await expect(page.locator('[data-event-image] img[data-event-image-source]')).toHaveAttribute('data-event-image-source','real');
    await page.goto('/podujatia/final-audit-4');await expect(page.locator('[data-event-image] img[data-event-image-source]')).toHaveAttribute('data-event-image-source','fallback');
    const related = page.locator('section[aria-labelledby="event-related-title"] [data-event-card]');
    await expect(related).toHaveCount(3);
    const geometry = await related.evaluateAll(cards => cards.map(card => ({
      height: card.getBoundingClientRect().height,
      imageWidth: card.querySelector('img')!.getBoundingClientRect().width,
    })));
    for (const card of geometry) {
      expect(card.height).toBeLessThan(260);
      expect(card.imageWidth).toBeLessThanOrEqual(128);
    }
    const results=await new AxeBuilder({page}).analyze();expect(results.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
  });
  test('date validation, labelled active filters, canonical SEO and cancelled/past states', async ({page}) => {
    await page.goto(target+'&od=2026-10-15&do=2026-10-16&mesto=zilina');
    await expect(page.locator('[aria-label="Aktívne filtre"]')).toContainText('Od: 2026-10-15');
    await expect(page.locator('[aria-label="Aktívne filtre"]')).toContainText('Do: 2026-10-16');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://psipedia.sk/podujatia');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content',/noindex/);
    await page.goto(target+'&od=2026-10-16&do=2026-10-15');await expect(page.getByRole('alert')).toContainText('Dátum od');await expect(page.getByRole('heading',{name:'Nenašli sme zhodu'})).toBeVisible();
    await page.goto(finalTarget+'&strana=2');await expect(page.locator('[data-event-card][data-event-status=cancelled]')).toHaveCount(1);await expect(page.locator('[data-event-card][data-event-status=past]').first()).toBeVisible();
    await page.goto(finalTarget+'&den=2026-10-16');await expect(page.locator('[data-selected-day]')).toContainText('Finalaudit Výstava 0');
  });
});
