import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
      createRoot(document.getElementById('root')).render(<AdminGeminiNotionDrafts stableKey="directory.veterinari"/>);`,
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
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let draft = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Test veterinár', category: 'veterinari',
        city: 'Žilina', lastEditedAt: 'v1', reviewState: 'NEW', psipediaId: '', psipediaStatus: 'Koncept', editorialState: 'Na kontrolu',
        website: 'https://example.test', source: 'https://example.test', notes: '', rejectionReason: '', seo: {},
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
      await page.getByRole('button', { name: 'Otvoriť editor' }).click();
      await page.getByRole('button', { name: 'Odmietnuť koncept', exact: true }).click();
      assert.equal(writes.length, 0, 'opening and confirmation do not write');
      await page.getByLabel('Dôvod odmietnutia (voliteľný)').fill('Mimo kategórie');
      await page.getByRole('button', { name: 'Áno, odmietnuť' }).click();
      await page.getByLabel('Stav konceptu').selectOption('REJECTED');
      await page.getByText('Dôvod: Mimo kategórie').waitFor();
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
      assert.equal(writes.some(write => write.method === 'POST'), false, 'save never publishes');
      await page.getByRole('button', { name: 'Otvoriť editor' }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `no horizontal page overflow at ${width}`);
      assert.deepEqual(writes.map(x => x.body.action), ['reject', 'restore', undefined]);
      assert.deepEqual(errors, []);
      if (process.env.GEMINI_TEST_SCREENSHOTS) await page.screenshot({ path: join(process.env.GEMINI_TEST_SCREENSHOTS, `gemini-review-${width}.png`) });
      await page.close();
    }
  } finally { await browser?.close(); await rm(dir, { recursive: true, force: true }); }
});
