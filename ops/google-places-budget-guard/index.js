'use strict';

const functions = require('@google-cloud/functions-framework');
const { GoogleAuth } = require('google-auth-library');
const { evaluateNotification } = require('./policy');
const { disablePlacesApi } = require('./service-usage');

functions.cloudEvent('psipediaPlacesBudgetGuard', async event => {
  const decision = evaluateNotification(event, { budgetId: process.env.PSIPEDIA_BUDGET_ID });
  if (!decision.disable) {
    console.info('Budget notification ignored:', decision.reason);
    return;
  }
  if (process.env.PSIPEDIA_GUARD_ENABLED !== 'true') {
    console.warn('Budget threshold reached but guard is not armed (dry run).');
    return;
  }

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const request = async (method, url, body) => {
    const { data } = await client.request({ method, url, ...(body ? { data: body } : {}) });
    return data;
  };
  const outcome = await disablePlacesApi(request);
  console.warn('Psipedia Places API budget protection:', outcome, 'actualCostEUR=' + decision.actualCost);
});
