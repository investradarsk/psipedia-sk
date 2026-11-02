'use strict';

export const TARGET_PROJECT = 'psipedia-production';
export const TARGET_SERVICE = 'places.googleapis.com';
const SERVICE_URL = 'https://serviceusage.googleapis.com/v1/projects/' + TARGET_PROJECT + '/services/' + TARGET_SERVICE;
const OPERATIONS_URL = 'https://serviceusage.googleapis.com/v1/';

export async function disablePlacesApi(request, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const existing = await request('GET', SERVICE_URL);
  if (existing?.state === 'DISABLED') return 'already-disabled';
  if (existing?.state !== 'ENABLED') throw new Error('Unable to verify Places API state');

  const operation = await request('POST', SERVICE_URL + ':disable', {
    disableDependentServices: false,
    checkIfServiceHasUsage: 'SKIP',
  });
  if (!operation || typeof operation.name !== 'string' || !/^operations\/[a-zA-Z0-9/_.-]+$/.test(operation.name)) {
    throw new Error('Service Usage did not return a valid operation');
  }
  let status = operation;
  for (let attempt = 0; attempt < 10 && !status.done; attempt++) {
    await sleep(1000);
    status = await request('GET', OPERATIONS_URL + operation.name);
  }
  if (!status.done) throw new Error('Places API disable operation was not confirmed (retry)');
  if (status.error) throw new Error('Places API disable rejected: ' + (status.error.code ?? 'unknown'));
  return 'disabled';
}

