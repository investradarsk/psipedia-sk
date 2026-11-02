'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { disablePlacesApi, TARGET_PROJECT, TARGET_SERVICE } from './service-usage.js';
const projectUrl = 'https://serviceusage.googleapis.com/v1/projects/' + TARGET_PROJECT + '/services/' + TARGET_SERVICE;

test('only specific Places API is disabled; not Cloud Billing, Gemini or Maps', async () => {
  const calls = [];
  const request = async (method, url, body) => {
    calls.push({ method, url, body });
    if (method === 'GET' && url === projectUrl) return { state: 'ENABLED' };
    if (method === 'POST') return { name: 'operations/example', done: false };
    if (url.endsWith('/operations/example')) return { done: true };
    throw Error('unexpected request');
  };
  assert.equal(await disablePlacesApi(request, { sleep: async () => {} }), 'disabled');
  assert.deepEqual(calls[1], { method: 'POST', url: projectUrl + ':disable', body: {
    disableDependentServices: false, checkIfServiceHasUsage: 'SKIP',
  } });
  assert.equal(calls.length, 3);
});
test('repeated budget event is idempotent if Places already disabled', async () => {
  const methods = [];
  const result = await disablePlacesApi(async method => { methods.push(method); return { state: 'DISABLED' }; });
  assert.equal(result, 'already-disabled');
  assert.deepEqual(methods, ['GET']);
});
test('unknown state, failed operation and unconfirmed response fail closed', async () => {
  await assert.rejects(disablePlacesApi(async () => ({ state: 'UNKNOWN' })), /Unable to verify/);
  await assert.rejects(disablePlacesApi(async method => method === 'GET' ? { state: 'ENABLED' } : { done: true }), /valid operation/);
  await assert.rejects(disablePlacesApi(async method =>
    method === 'POST' ? { name: 'operations/abc', done: true, error: { code: 7 } } : { state: 'ENABLED' }
  ), /disable rejected/);
});
