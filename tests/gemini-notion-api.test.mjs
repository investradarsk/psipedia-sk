import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, PUT, PATCH } from '../app/api/admin/gemini-automation/notion-drafts/[id]/route.ts';
import { POST } from '../app/api/admin/gemini-automation/notion-drafts/[id]/publish/route.ts';

test('every Gemini review API entry refuses unauthenticated access before reading or writing Notion', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Unexpected network'); };
  try {
    for (const [method, handler] of [['GET', GET], ['PUT', PUT], ['PATCH', PATCH], ['POST', POST]]) {
      const response = await handler(new Request('https://psipedia.sk/api/admin/test', { method }), { params: Promise.resolve({ id: 'invalid' }) });
      assert.equal(response.status, 401);
    }
  } finally { globalThis.fetch = original; }
});
