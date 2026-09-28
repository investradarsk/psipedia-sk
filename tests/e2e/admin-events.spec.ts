import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Requires the dedicated local fixtures; other E2E suites keep their own DB.
test.skip(process.env.PSIPEDIA_ADMIN_EVENTS_E2E !== '1', 'Run the dedicated admin event fixture workflow.');
test.beforeEach(async ({ page, baseURL }) => {
  const url = new URL(baseURL!);
  test.skip(url.hostname !== 'localhost' || process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP !== '1', 'Only isolated localhost event fixtures are permitted.');
  await page.addInitScript(() => localStorage.setItem('psipedia-cookie-consent', 'necessary'));
});

async function expectNoAxeViolations(page: import('@playwright/test').Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
}

test('all 175 events, global counts, filters, pagination and responsive list', async ({ page }, info) => {
  let releaseModule!: () => void;
  const moduleGate = new Promise<void>(resolve => { releaseModule = resolve; });
  await page.route('**/components/admin-event-dashboard.tsx*', async route => { await moduleGate; await route.continue(); });
  await page.goto('/admin/podujatia', { waitUntil: 'domcontentloaded' });
  try {
    await expect(page.getByRole('button', { name: 'Prebiehajúce', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Publikačný stav', { exact: true })).toBeDisabled();
  } finally { releaseModule(); }
  await expect(page.locator('.admin-events-workspace')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('[data-count="all"] strong')).toHaveText('175');
  await expect(page.locator('[data-count="published"] strong')).toHaveText('4');
  await expect(page.locator('[data-count="draft"] strong')).toHaveText('171');
  await expect(page.locator('.admin-event-row-v2')).toHaveCount(50);
  await page.getByRole('button',{name:'Nasledujúca',exact:true}).click();
  await page.getByRole('button',{name:'Nasledujúca',exact:true}).click();
  await expect(page.getByText('Strana 3 z 4',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Nasledujúca',exact:true}).click();
  await expect(page.locator('.admin-event-row-v2')).toHaveCount(25);
  await page.getByLabel('Hľadať podujatie',{exact:true}).fill('e2e-admin-event-175');
  await expect(page.locator('.admin-event-row-v2')).toHaveCount(1);
  await expect(page.locator('.admin-event-row-v2')).toContainText('Bez obrázka');
  await expect(page.locator('.admin-event-row-v2')).toContainText('čas neuvedený');
  await expect(page.locator('[data-count="all"] strong')).toHaveText('175');
  await page.getByRole('button',{name:'Zrušiť filtre',exact:true}).click();
  await page.getByRole('button',{name:'Minulé',exact:true}).click();
  await page.getByLabel('Publikačný stav',{exact:true}).selectOption('draft');
  await expect(page.locator('.admin-event-row-v2').first()).toContainText('Koncept');
  await expect(page.locator('.admin-event-row-v2').first()).toContainText('Ukončené');
  await mkdir('.e2e-artifacts/admin-events',{recursive:true});
  await page.screenshot({path:`.e2e-artifacts/admin-events/past-filter-${info.project.name}.png`,fullPage:true});
  await page.locator('.admin-event-row-v2').first().screenshot({path:`.e2e-artifacts/admin-events/draft-past-${info.project.name}.png`});
  await page.getByRole('button',{name:/^Zrušené/}).click();
  await expect(page.locator('.admin-event-row-v2')).toHaveCount(1);
  await page.getByRole('button',{name:'Zrušiť filtre',exact:true}).click();
  await page.getByLabel('Kraj',{exact:true}).selectOption('Žilinský kraj');
  await page.getByRole('group',{name:'Vyhľadávanie a filtre podujatí'}).getByLabel('Typ podujatia',{exact:true}).selectOption('Preteky');
  await page.getByLabel('Hľadať podujatie',{exact:true}).fill('sportovy zilina');
  expect(await page.locator('.admin-event-row-v2').count()).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Zrušiť filtre',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expectNoAxeViolations(page);
  await page.evaluate(()=>window.scrollTo(0,0));
  await mkdir('.e2e-artifacts/admin-events',{recursive:true});
  await page.screenshot({path:`.e2e-artifacts/admin-events/list-${info.project.name}.png`});
});

test('bulk publish uses Foundation confirmation and sends exact reviewed selection', async ({ page }) => {
  await page.goto('/admin/podujatia');
  await page.getByLabel('Publikačný stav',{exact:true}).selectOption('draft');
  await page.getByLabel('Hľadať podujatie',{exact:true}).fill('e2e-admin-event-175');
  await page.getByRole('checkbox',{name:/^Vybrať Stretnutie/}).check();
  let requests=0;
  await page.route('**/api/admin/events/bulk',async route=>{
    requests++;
    const payload=route.request().postDataJSON();
    expect(payload.field).toBe('status');
    expect(payload.value).toBe('published');
    expect(payload.confirmedCount).toBe(1);
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].id).toBe(175);
    expect(payload.events[0].eventType).toBeTruthy();
    expect(typeof payload.events[0].cancelled).toBe('boolean');
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({changed:1,field:'status'})});
  });
  const toolbar=page.locator('[data-admin-bulk-toolbar]');
  await toolbar.getByRole('button',{name:'Publikovať',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Publikovať vybrané podujatia'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Zmení sa 1 z 1 vybraných podujatí');
  expect(requests).toBe(0);
  await dialog.getByRole('button',{name:'Zrušiť',exact:true}).click();
  expect(requests).toBe(0);
  await toolbar.getByRole('button',{name:'Publikovať',exact:true}).click();
  await page.getByRole('dialog',{name:'Publikovať vybrané podujatia'}).getByRole('button',{name:'Publikovať',exact:true}).click();
  await expect(page.getByText('Zmenených podujatí: 1.',{exact:true})).toBeVisible();
  expect(requests).toBe(1);
  await expect(page.locator('[data-count="draft"] strong')).toHaveText('171');
});

test('create and edit routes keep the existing event lifecycle contract', async ({ page }) => {
  await page.goto('/admin/podujatia/nove');
  await expect(page.getByLabel('Názov podujatia',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Typ podujatia',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Dátum začiatku',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Uložiť|koncept/i}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

  await page.goto('/admin/podujatia/175');
  await expect(page.getByLabel('Názov podujatia',{exact:true})).toHaveValue('Stretnutie majiteľov psov 175');
  await expect(page.getByLabel('Typ podujatia',{exact:true})).toHaveValue('Stretnutie');
  await expect(page.getByLabel('Dátum začiatku',{exact:true})).not.toHaveValue('');
  await expectNoAxeViolations(page);
});

test('editor toolbar and live preview, old plain text, XSS stays inert', async ({ page }, info) => {
  await page.goto('/admin/podujatia/175');
  const field=page.getByLabel('Podrobný popis',{exact:true});
  await expect(field).toHaveValue(/Stretnutie pre majiteľov psov\./);
  await expect(field).toBeEnabled();
  await field.fill('Program');
  await field.evaluate((element: HTMLTextAreaElement) => { element.focus(); element.setSelectionRange(0, element.value.length); });
  await page.getByRole('group',{name:'Formátovanie: Podrobný popis',exact:true}).getByRole('button',{name:'Tučné',exact:true}).click();
  await expect(field).toHaveValue('**Program**');
  // DOM text must also win when React has not received an input event yet.
  await field.evaluate((element: HTMLTextAreaElement) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, 'Rýchly text');
    element.focus(); element.setSelectionRange(0, element.value.length);
  });
  await page.getByRole('group',{name:'Formátovanie: Podrobný popis',exact:true}).getByRole('button',{name:'Tučné',exact:true}).click();
  await expect(field).toHaveValue('**Rýchly text**');
  const preview=page.getByRole('region',{name:'Náhľad: Podrobný popis',exact:true});
  await expect(preview.locator('strong')).toHaveText('Rýchly text');
  await field.fill('## Program dňa\n\n**Spoločný tréning** a *praktické ukážky*.\n\n- Privítanie účastníkov\n- Práca so psom\n\n1. Príchod\n2. Tréning\n\n[Informácie](https://example.org)\n\n<script>window.injected=true</script>');
  await expect(preview.locator('ul li')).toHaveCount(2);await expect(preview.locator('ol li')).toHaveCount(2);
  await expect(preview.locator('script')).toHaveCount(0);await expect(preview.getByText('<script>window.injected=true</script>',{exact:true})).toBeVisible();
  await field.fill((await field.inputValue()).replace('\n\n<script>window.injected=true</script>',''));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.admin-markdown-editor').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:`.e2e-artifacts/admin-events/editor-${info.project.name}.png`});
});

test('bulk API refuses cross-origin and stale selections without changing DB',async({request})=>{
  const before=await (await request.get('/api/admin/events')).json();
  const row=before.events.find((e:{id:number})=>e.id===175);
  const payload={events:[{id:row.id,status:row.status,eventType:row.eventType,cancelled:row.cancelled,updatedAt:'stale'}],field:'status',value:'published',confirmedCount:1};
  const foreign=await request.post('/api/admin/events/bulk',{data:payload,headers:{Origin:'https://untrusted.example'}});
  expect(foreign.status()).toBe(403);
  const stale=await request.post('/api/admin/events/bulk',{data:payload,headers:{Origin:new URL(process.env.E2E_BASE_URL || 'http://localhost:5173').origin}});
  expect(stale.status()).toBe(409);
  const after=await (await request.get('/api/admin/events')).json();expect(after).toEqual(before);
});


test('time filters, start month/year and sorting work across the complete dataset', async ({ page, request }) => {
  const data = await (await request.get('/api/admin/events')).json();
  await page.goto('/admin/podujatia');
  await page.getByRole('button', { name: 'Prebiehajúce', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prebiehajúce', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.admin-event-row-v2')).toHaveCount(1);
  await expect(page.locator('.admin-event-row-v2')).toContainText('Prebieha');
  await expect(page.locator('[data-count="current"] strong')).toHaveText('1');
  await page.getByRole('button', { name: 'Nadchádzajúce', exact: true }).click();
  await expect(page.locator('.admin-event-row-v2').first()).toContainText('Agility pohár 2');
  await expect(page.locator('.admin-event-row-v2 .admin-event-chip').first()).toHaveText('Nadchádzajúce');
  await page.getByRole('button', { name: 'Minulé', exact: true }).click();
  await expect(page.locator('.admin-event-row-v2').first()).toContainText('Stretnutie majiteľov psov 5');
  await expect(page.locator('[data-count="past"] strong')).toHaveText('15');
  await page.getByRole('button', { name: 'Zrušiť filtre', exact: true }).click();
  const target = data.events.find((e: { id: number }) => e.id === 2);
  await page.getByLabel('Mesiac začiatku', { exact: true }).selectOption(target.startDate.slice(5,7));
  await page.getByLabel('Rok začiatku', { exact: true }).selectOption(target.startDate.slice(0,4));
  await page.getByRole('group',{name:'Vyhľadávanie a filtre podujatí'}).getByLabel('Typ podujatia', { exact: true }).selectOption('Preteky');
  await page.getByLabel('Kraj', { exact: true }).selectOption('Žilinský kraj');
  const expected = data.events.filter((e: { startDate: string; eventType: string; region: string }) => e.startDate.slice(0,7) === target.startDate.slice(0,7) && e.eventType === 'Preteky' && e.region === 'Žilinský kraj');
  await expect(page.locator('.admin-event-row-v2')).toHaveCount(expected.length);
  await expect(page.locator('[data-count="all"] strong')).toHaveText('175');
  await page.getByRole('button', { name: 'Zrušiť filtre', exact: true }).click();
  await page.getByLabel('Zoradiť', { exact: true }).selectOption('title');
  const names = data.events.map((e: { title: string }) => e.title).sort((a: string,b: string)=>a.localeCompare(b,'sk'));
  await expect(page.locator('.admin-event-row-v2 h2')).toHaveText(names.slice(0,50));
  await page.getByLabel('Zoradiť', { exact: true }).selectOption('updated');
  await expect(page.locator('.admin-event-row-v2').first()).toContainText('Stretnutie majiteľov psov 175');
  await page.getByLabel('Zoradiť', { exact: true }).selectOption('created');
  await expect(page.locator('.admin-event-row-v2')).toHaveCount(50);
  await page.getByLabel('Zoradiť', { exact: true }).selectOption('date');
  await expect(page.locator('.admin-event-row-v2').first()).toContainText('Klubová výstava retrieverov 1');
});

test('select page and unpublish confirmation use only selected IDs with no production writes', async ({ page }) => {
  await page.goto('/admin/podujatia');
  await page.getByRole('checkbox', { name: 'Vybrať túto stranu', exact: true }).check();
  await expect(page.getByText('Vybrané: 50', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zrušiť výber', exact: true }).click();
  await expect(page.getByText('Vybrané: 0', { exact: true })).toBeVisible();
  await page.getByLabel('Publikačný stav', { exact: true }).selectOption('published');
  await page.getByLabel('Hľadať podujatie', { exact: true }).fill('e2e-admin-event-4');
  await page.getByRole('checkbox', { name: 'Vybrať Tréningový deň 4', exact: true }).check();
  let requests = 0;
  await page.route('**/api/admin/events/bulk', async route => {
    requests++;
    const payload = route.request().postDataJSON();
    expect(payload.field).toBe('status');
    expect(payload.value).toBe('draft');
    expect(payload.confirmedCount).toBe(1);
    expect(payload.events.map((event: {id:number})=>event.id)).toEqual([4]);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({changed:1,field:'status'})});
  });
  const toolbar=page.locator('[data-admin-bulk-toolbar]');
  await toolbar.getByRole('button', { name: 'Stiahnuť do konceptu', exact: true }).click();
  const dialog=page.getByRole('dialog',{name:'Stiahnuť vybrané podujatia do konceptu'});
  await expect(dialog).toBeVisible();
  expect(requests).toBe(0);
  await dialog.getByRole('button',{name:'Zrušiť',exact:true}).click();
  await toolbar.getByRole('button', { name: 'Stiahnuť do konceptu', exact: true }).click();
  await page.getByRole('dialog',{name:'Stiahnuť vybrané podujatia do konceptu'}).getByRole('button',{name:'Stiahnuť do konceptu',exact:true}).click();
  await expect(page.getByText('Zmenených podujatí: 1.', { exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await expect(page.locator('[data-count="published"] strong')).toHaveText('4');
});

test('bulk edit shell supports existing type and cancellation fields only', async ({ page }) => {
  await page.goto('/admin/podujatia');
  await page.getByLabel('Hľadať podujatie',{exact:true}).fill('e2e-admin-event-175');
  await page.getByRole('checkbox',{name:/^Vybrať Stretnutie/}).check();

  const requests: Array<{field:string;value:unknown;confirmedCount:number}> = [];
  await page.route('**/api/admin/events/bulk', async route => {
    const payload=route.request().postDataJSON();
    requests.push({field:payload.field,value:payload.value,confirmedCount:payload.confirmedCount});
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({changed:1,field:payload.field})});
  });

  await page.getByRole('button',{name:'Hromadne upraviť',exact:true}).click();
  const shell=page.locator('[data-admin-bulk-edit-shell]');
  await expect(shell).toBeVisible();
  await expect(shell).toContainText('Nezmení sa:');
  await shell.getByLabel('Nový typ',{exact:true}).selectOption('Preteky');
  await shell.getByRole('button',{name:'Potvrdiť hromadnú úpravu',exact:true}).click();
  await expect(page.getByText('Zmenených podujatí: 1.',{exact:true})).toBeVisible();
  expect(requests[0]).toEqual({field:'eventType',value:'Preteky',confirmedCount:1});

  await page.getByLabel('Hľadať podujatie',{exact:true}).fill('e2e-admin-event-175');
  await page.getByRole('checkbox',{name:/^Vybrať Stretnutie/}).check();
  await page.getByRole('button',{name:'Hromadne upraviť',exact:true}).click();
  await shell.getByLabel('Pole',{exact:true}).selectOption('cancelled');
  await shell.getByLabel('Nový stav',{exact:true}).selectOption('true');
  await shell.getByRole('button',{name:'Potvrdiť hromadnú úpravu',exact:true}).click();
  await expect(page.getByText('Zmenených podujatí: 1.',{exact:true})).toBeVisible();
  expect(requests[1]).toEqual({field:'cancelled',value:true,confirmedCount:1});
});

test('quick edit drawer is scoped, keyboard closable and restores trigger focus', async ({ page }) => {
  await page.goto('/admin/podujatia');
  await page.getByLabel('Hľadať podujatie',{exact:true}).fill('e2e-admin-event-175');
  const trigger=page.getByRole('button',{name:'Rýchla úprava',exact:true});
  await trigger.focus();
  await trigger.click();
  const drawer=page.getByRole('dialog',{name:'Rýchla úprava'});
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Stretnutie majiteľov psov 175',{exact:true})).toBeVisible();
  await expect(drawer).toContainText('nemení názov, termín, miesto, text, obrázok, SEO ani publikačný stav');
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole('combobox',{name:'Typ podujatia',exact:true}).selectOption('Preteky');
  await drawer.getByRole('checkbox',{name:'Podujatie je zrušené',exact:true}).check();
  let patch=0;
  await page.route('**/api/admin/events/175', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patch++;
    const payload=route.request().postDataJSON();
    expect(payload.eventType).toBe('Preteky');
    expect(payload.cancelled).toBe(true);
    expect(payload.updatedAt).toBeTruthy();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({event:{}})});
  });
  await drawer.getByRole('button',{name:'Uložiť',exact:true}).click();
  await expect(page.getByText('Sekundárne nastavenia podujatia boli uložené.',{exact:true})).toBeVisible();
  expect(patch).toBe(1);
  await expect(trigger).toBeFocused();
});

test('quick edit API rejects foreign origin and stale revision without changing fixture', async ({ request }) => {
  const before=await (await request.get('/api/admin/events')).json();
  const row=before.events.find((event:{id:number})=>event.id===175);
  const payload={eventType:'Preteky',cancelled:true,updatedAt:'stale'};
  const foreign=await request.patch('/api/admin/events/175',{data:payload,headers:{Origin:'https://untrusted.example'}});
  expect(foreign.status()).toBe(403);
  const stale=await request.patch('/api/admin/events/175',{data:payload,headers:{Origin:new URL(process.env.E2E_BASE_URL || 'http://localhost:5173').origin}});
  expect(stale.status()).toBe(409);
  const after=await (await request.get('/api/admin/events')).json();
  expect(after).toEqual(before);
  expect(row.eventType).toBe('Stretnutie');
});
