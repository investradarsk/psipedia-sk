'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNotification, monthKey } from './policy.js';

const id = '11111111-2222-4333-8444-555555555555';
const now = new Date('2026-11-02T09:00:00Z');
const base = {
  budgetDisplayName: 'Psipedia Google Maps',
  costAmount: 5.02,
  budgetAmount: 5,
  budgetAmountType: 'SPECIFIED_AMOUNT',
  currencyCode: 'EUR',
  costIntervalStart: '2026-11-01T07:00:00Z',
};
function event(body = base, attrs = {}) {
  return { data: { message: {
    attributes: { billingAccountId: '01B80F-785E05-3CE7BE', budgetId: id, schemaVersion: '1.0', ...attrs },
    data: Buffer.from(JSON.stringify(body)).toString('base64'),
  } } };
}
const check = (evt, budgetId = id) => evaluateNotification(evt, { budgetId, now });

test('5 EUR actual spend disables Places after correct budget notification', () => {
  assert.equal(check(event({ ...base, costAmount: 5 })).disable, true);
  assert.equal(check(event()).actualCost, 5.02);
});
test('under 5 EUR actual spend is a no-op even with forecast threshold 100%', () => {
  assert.equal(check(event({ ...base, costAmount: 4.99, forecastThresholdExceeded: 1 })).disable, false);
});
test('reject wrong account, budget ID, schema and name', () => {
  assert.equal(check(event(base, { billingAccountId: 'wrong' })).disable, false);
  assert.equal(check(event(base, { budgetId: 'wrong' })).disable, false);
  assert.equal(check(event(base, { schemaVersion: '2.0' })).disable, false);
  assert.equal(check(event({ ...base, budgetDisplayName: 'Different budget' })).disable, false);
});
test('invalid or unconfigured budget ID does not arm the guard', () => {
  assert.equal(check(event(), '').reason, 'budget-id-unconfigured');
  assert.equal(check(event(), 'abc').disable, false);
});
test('reject wrong currency or unexpected amount or dynamic budget', () => {
  assert.equal(check(event({ ...base, currencyCode: 'USD' })).disable, false);
  assert.equal(check(event({ ...base, budgetAmount: 50 })).disable, false);
  assert.equal(check(event({ ...base, budgetAmountType: 'LAST_MONTH_COST' })).disable, false);
});
test('reject old, future and invalid billing period even over 5 EUR', () => {
  assert.equal(check(event({ ...base, costIntervalStart: '2026-10-01T07:00:00Z' })).disable, false);
  assert.equal(check(event({ ...base, costIntervalStart: '2026-12-01T08:00:00Z' })).disable, false);
  assert.equal(check(event({ ...base, costIntervalStart: 'bad date' })).disable, false);
});
test('November monthly boundary is evaluated in Pacific time (including DST)', () => {
  assert.equal(monthKey('2026-11-01T07:00:00Z'), '2026-11');
  assert.equal(monthKey('2026-11-01T06:59:59Z'), '2026-10');
});
test('bad Pub/Sub payload is ignored; never disables an API', () => {
  assert.equal(check(null).disable, false);
  assert.equal(check({ data: { message: { data: '%%%bad%%%=' } } }).disable, false);
  assert.equal(check(event({ ...base, costAmount: NaN })).disable, false);
});
