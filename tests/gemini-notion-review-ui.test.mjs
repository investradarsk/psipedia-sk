import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Real list/modal/directory editor, isolated API fixtures; no server credentials.
test('Gemini list and shared editor support reject/restore/save on mobile and desktop', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gemini-review-ui-'));
  let browser;
  try {
    await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {AdminGeminiNotionDrafts} from './components/admin-gemini-notion-drafts';
      import './app/admin/admin-workspace.css'; import './app/admin/admin-legacy-scoped.css';
      const category = new URLSearchParams(location.search).get('category') ?? 'directory.veterinari';
      createRoot(document.getElementById('root')).render(<AdminGeminiNotionDrafts stableKey={category}/>);`,
      loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: join(dir, 'app.js'), jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [{ name: 'next-link-fixture', setup(b) {
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react'; export default function Link(p){return React.createElement('a',p)}`, resolveDir: process.cwd() }));
      } }],
    });
    const js = await readFile(join(dir, 'app.js'), 'utf8');
    const css = await readFile(join(dir, 'app.css'), 'utf8');
    browser = await chromium.launch({ headless: true, ...(process.env.GEMINI_TEST_CHROMIUM ? { executablePath: process.env.GEMINI_TEST_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-zygote'] } : {}) });
    const shotDir = process.env.GEMINI_TEST_SCREENSHOTS;
    if (shotDir) await mkdir(shotDir, { recursive: true });
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let draft = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Test veterinár', category: 'veterinari',
        city: 'Žilina', lastEditedAt: 'v1', reviewState: 'NEW', psipediaId: '', psipediaStatus: 'Koncept', editorialState: 'Na kontrolu',
        geminiNote: 'Overte duplicitu <script>alert(1)</script>', website: 'https://example.test', source: 'https://example.test', notes: '', rejectionReason: '', seo: {},
        qualityResolutions: { phone: '', email: '', website: '', image: '', address: '' } };
      const writes = [];
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:12px}${css}</style></head><body class="admin-body"><div class="admin-workspace" id="root"></div><script>${js}</script></body></html>` });
        if (url.pathname.includes('/notion-drafts')) {
          if (['PATCH', 'PUT', 'POST'].includes(route.request().method())) {
            const body = route.request().postDataJSON(); writes.push({ method: route.request().method(), body });
            if (body.action === 'reject') draft = { ...draft, reviewState: 'REJECTED', rejectionReason: body.reason, lastEditedAt: 'v2' };
            if (body.action === 'restore') draft = { ...draft, reviewState: 'IN_PROGRESS', lastEditedAt: 'v3' };
            if (route.request().method() === 'PUT') draft = { ...draft, name: body.name, reviewState: 'IN_PROGRESS', lastEditedAt: 'v4' };
          }
          return route.fulfill({ json: url.search ? { drafts: [draft] } : { draft } });
        }
        return route.fulfill({ json: { items: [], regions: [], districts: [], cities: [] } });
      });
      await page.goto('https://fixture.test/');
      await page.getByRole('button', { name: 'Koncepty z automatizácie' }).click();
      await page.getByLabel('Gemini poznámka', { exact: true }).first().waitFor({ state: 'visible' });
      if (shotDir) await page.screenshot({ path: join(shotDir, `01-directory-list-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Otvoriť editor' }).click();
      if (shotDir) await page.screenshot({ path: join(shotDir, `02-directory-modal-${width}.png`) });
      await page.getByRole('button', { name: 'Odmietnuť koncept', exact: true }).click();
      assert.equal(writes.length, 0, 'opening and confirmation do not write');
      await page.getByLabel('Dôvod odmietnutia (voliteľný)').fill('Mimo kategórie');
      await page.getByRole('button', { name: 'Áno, odmietnuť' }).click();
      await page.getByLabel('Stav konceptu').selectOption('REJECTED');
      try {
        await page.getByText('Dôvod: Mimo kategórie').waitFor({ timeout: 8000 });
        if (shotDir) await page.screenshot({ path: join(shotDir, `03-directory-rejected-${width}.png`) });
      } catch (error) {
        // Print actionable fixture state instead of waiting 30 seconds on a
        // silent mismatch between Notion update and the visible review list.
        console.error('Gemini review fixture diagnostics', JSON.stringify({
          width, latestDraft: draft, writes, visibleText: await page.locator('body').innerText(),
        }));
        throw error;
      }
      await page.getByRole('button', { name: 'Otvoriť editor' }).click();
      assert.equal(await page.getByRole('button', { name: 'Publikovať profil', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: 'Obnoviť koncept', exact: true }).click();
      await page.getByRole('button', { name: 'Áno, obnoviť' }).click();
      await page.getByLabel('Stav konceptu').selectOption('IN_PROGRESS');
      await page.getByRole('button', { name: 'Otvoriť editor' }).click();
      assert.equal(await page.getByRole('button', { name: 'Uložiť koncept', exact: true }).isEnabled(), true);
      await page.getByLabel('Názov profilu', { exact: true }).fill('Upravený veterinár');
      await page.getByRole('button', { name: 'Uložiť koncept', exact: true }).click();
      await page.getByText('Upravený veterinár', { exact: true }).waitFor();
      assert.equal(writes.at(-1).method, 'PUT');
      assert.ok(!JSON.stringify(writes).includes('Overte duplicitu'));
      assert.ok(!Object.hasOwn(writes.at(-1).body, 'geminiNote'));
      assert.equal(writes.some(write => write.method === 'POST'), false, 'save never publishes');
      await page.getByRole('button', { name: 'Otvoriť editor' }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `no horizontal page overflow at ${width}`);
      assert.deepEqual(writes.map(x => x.body.action), ['reject', 'restore', undefined]);
      assert.deepEqual(errors, []);

      await page.close();
    }
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const draft = {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: 'Výstava psov Nitra', agenda: 'events', stableKey: 'events.vystavy',
        city: 'Nitra', reviewState: 'IMPORTED', psipediaId: '321',
        canonicalVerified: true, lastEditedAt: '2026-10-17T10:00:00Z',
        geminiNote: 'Testovacie údaje', fields: [], reviewAvailable: true,
      };
      const writes = [];
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body:
          `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:12px}${css}</style></head><body class="admin-body"><div class="admin-workspace" id="root"></div><script>${js}</script></body></html>` });
        if (url.pathname === '/api/admin/gemini-automation/notion-drafts') {
          return route.fulfill({ json: { drafts: [draft] } });
        }
        if (url.pathname.startsWith('/api/admin/gemini-automation/notion-drafts/')) {
          writes.push(route.request().method());
          return route.fulfill({ status: 500, json: { error: 'Imported agenda must not enter Notion-only editor' } });
        }
        if (url.pathname === '/admin/podujatia/321') {
          return route.fulfill({ contentType: 'text/html', body: '<h1>Canonical podujatie #321 — testovacia route</h1>' });
        }
        return route.fulfill({ status: 404, body: 'Unexpected fixture URL: ' + url.pathname });
      });
      await page.goto('https://fixture.test/?category=events.vystavy');
      await page.getByRole('button', { name: 'Koncepty z automatizácie' }).click();
      const editor = page.getByRole('link', { name: 'Upraviť v sekcii' });
      await editor.waitFor();
      assert.equal(await editor.getAttribute('href'), '/admin/podujatia/321');
      assert.equal(await page.locator('iframe').count(), 0, 'imported agenda never creates an admin iframe');
      assert.equal(await page.getByRole('button', { name: 'Otvoriť editor' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Kôš' }).count(), 0);
      assert.deepEqual(writes, [], 'listing/import link cannot mutate or open a second Notion editor');
      if (shotDir) await page.screenshot({ path: join(shotDir, `04-imported-event-list-${width}.png`), fullPage: true });
      await editor.click();
      assert.equal(new URL(page.url()).pathname, '/admin/podujatia/321');
      await page.getByText('Canonical podujatie #321').waitFor();
      await page.close();
    }
  } finally { await browser?.close(); await rm(dir, { recursive: true, force: true }); }
});
