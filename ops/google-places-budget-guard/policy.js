'use strict';

const BILLING_ACCOUNT_ID = '01B80F-785E05-3CE7BE';
const BUDGET_NAME = 'Psipedia Google Maps';
const AMOUNT_EUR = 5;
const TIME_ZONE = 'America/Los_Angeles';

export function monthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  return year && month ? year + '-' + month : null;
}

export function evaluateNotification(cloudEvent, { budgetId, now = new Date() } = {}) {
  if (!budgetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(budgetId)) {
    return { disable: false, reason: 'budget-id-unconfigured' };
  }
  const message = cloudEvent?.data?.message;
  if (!message || typeof message.data !== 'string') {
    return { disable: false, reason: 'invalid-pubsub-envelope' };
  }
  const attrs = message.attributes || {};
  if (attrs.billingAccountId !== BILLING_ACCOUNT_ID || attrs.budgetId !== budgetId || attrs.schemaVersion !== '1.0') {
    return { disable: false, reason: 'unexpected-budget-source' };
  }
  let body;
  try {
    body = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
  } catch {
    return { disable: false, reason: 'invalid-budget-payload' };
  }
  if (body?.budgetDisplayName !== BUDGET_NAME || body?.currencyCode !== 'EUR' || body?.budgetAmountType !== 'SPECIFIED_AMOUNT') {
    return { disable: false, reason: 'unexpected-budget' };
  }
  if (!Number.isFinite(body.budgetAmount) || Math.abs(body.budgetAmount - AMOUNT_EUR) > 0.000001) {
    return { disable: false, reason: 'budget-amount-changed' };
  }
  if (monthKey(body.costIntervalStart) === null || monthKey(body.costIntervalStart) !== monthKey(now)) {
    return { disable: false, reason: 'stale-or-invalid-billing-period' };
  }
  if (!Number.isFinite(body.costAmount) || body.costAmount < AMOUNT_EUR) {
    return { disable: false, reason: 'actual-cost-below-limit' };
  }
  return { disable: true, reason: 'monthly-actual-spend-at-least-5-eur', actualCost: body.costAmount };
}

