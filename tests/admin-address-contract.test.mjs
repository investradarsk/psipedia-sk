import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOVAK_REGIONS, SLOVAK_DISTRICTS_BY_REGION, SLOVAK_MUNICIPALITIES_BY_DISTRICT } from '../lib/slovakia-locations.ts';
import { normalizeAdminAddress, adminAddressFromSource, adminAddressPlaceState, evaluateAdminAddress, previewAdminAddressPatch } from '../lib/admin-address-contract.ts';
import { directoryAdminAddress, eventAdminAddress, organizationAdminAddress, googleAdminAddressProposal } from '../lib/admin-address-adapters.ts';

const source = { targetType: 'DIRECTORY_PROFILE', targetId: 1, label: 'Test', region: 'Nitriansky kraj', district: 'Zlaté Moravce', city: 'Zlaté Moravce', postalCode: '09501', street: 'Hlavná', houseNumber: '1127/21', addressFormat: 'STREET', address: 'Vlastný text\npri parku' };
const geo = { sourceFingerprint: 'a', resolvedSourceFingerprint: 'a', googlePlaceSourceFingerprint: 'a', googlePlaceId: 'place', googlePlaceMatchedAt: '2026-10-12', geocodeStatus: 'RESOLVED', publicVisibility: 'EXACT_PUBLIC', publicPrecision: 'EXACT', manualOverride: false, latitude: 48, longitude: 18 };
const snapshot = (overrides = {}, point = null) => adminAddressFromSource({ ...source, ...overrides }, 'revision-1', point);
const guard = a => ({ target: a.target, revision: a.revision, sourceFingerprint: a.geo?.sourceFingerprint ?? null });
const preview = (a, patch, actor = 'IMPORT') => previewAdminAddressPatch(a, patch, guard(a), actor);
const set = value => ({ kind: 'set', value });
const has = (result, code) => result.conflicts.some(c => c.code === code);

test('all 8 regions, 79 districts and 2927 municipalities validate against the existing hierarchy', () => {
  assert.equal(SLOVAK_REGIONS.length, 8);
  assert.equal(Object.values(SLOVAK_DISTRICTS_BY_REGION).flat().length, 79);
  let count = 0;
  for (const region of SLOVAK_REGIONS) for (const district of SLOVAK_DISTRICTS_BY_REGION[region]) {
    for (const city of SLOVAK_MUNICIPALITIES_BY_DISTRICT[district]) {
      assert.deepEqual(normalizeAdminAddress({ region, district, city }).issues, [], `${region}/${district}/${city}`);
      count++;
    }
    const wrongRegion = SLOVAK_REGIONS.find(r => r !== region);
    assert.ok(normalizeAdminAddress({ region: wrongRegion, district }).issues.some(i => i.code === 'REGION_DISTRICT_MISMATCH'));
  }
  assert.equal(count, 2927);
});
test('diacritics, decomposed Unicode, case, whitespace and dash variants normalize without guessing', () => {
  const result = normalizeAdminAddress({ region: '  NITRIANSKY KRAJ ', district: 'Zlate Moravce', city: 'Zlate\u0301 Moravce', postalCode: ' 09501 ', houseNumber: ' 12/A ' });
  assert.deepEqual(result.issues, []);
  assert.equal(result.fields.city, 'Zlaté Moravce');
  assert.equal(result.fields.postalCode, '095 01');
  assert.equal(result.fields.houseNumber, '12/A');
  assert.equal(normalizeAdminAddress({ city: 'Zlaté Moravce' }).fields.district, null);
  assert.equal(normalizeAdminAddress({ city: 'Lúčky' }).issues[0].code, 'AMBIGUOUS_CITY');
  assert.equal(normalizeAdminAddress({ region: 'Bratislavsky kraj', district: 'Bratislava I', city: 'Bratislava — Stare Mesto' }).issues.length, 0);
});
test('invalid combinations, unknown names, postal formats and numeric values are rejected', () => {
  for (const input of [{ region: 'Nitriansky kraj', district: 'Žilina' }, { district: 'Nitra', city: 'Žilina' }, { region: 'Atlantis' }, { postalCode: '9501' }, { addressFormat: 'OTHER' }]) assert.ok(normalizeAdminAddress(input).issues.length);
  assert.throws(() => normalizeAdminAddress({ postalCode: 9501 }), TypeError);
  assert.throws(() => normalizeAdminAddress({ houseNumber: 12 }), TypeError);
  assert.throws(() => normalizeAdminAddress({ street: 'A\u0000B' }), TypeError);
});
test('completeness is independent of service and Google confirmation; numberless and municipality numbers work', () => {
  const a = snapshot();
  assert.equal(evaluateAdminAddress(a).state, 'COMPLETE');
  assert.equal(a.serviceAddressConfirmation, 'LEGACY_UNCONFIRMED');
  assert.equal(adminAddressPlaceState(a), 'NONE');
  assert.equal(evaluateAdminAddress(snapshot({ houseNumber: '' })).reason, 'NUMBERLESS_PLACE');
  assert.equal(evaluateAdminAddress(snapshot({ street: '', addressFormat: 'MUNICIPALITY_NUMBER', houseNumber: '12/A' })).state, 'COMPLETE');
  assert.equal(evaluateAdminAddress(snapshot({ street: '', houseNumber: '', addressFormat: '' })).state, 'INCOMPLETE');
  assert.equal(evaluateAdminAddress(snapshot({ postalCode: '' }, geo)).state, 'INCOMPLETE');
  assert.equal(adminAddressPlaceState(snapshot({ postalCode: '' }, geo)), 'CURRENT');
});
test('existing source adapters preserve legacy records, editorial text, identity and absent columns', () => {
  const before = structuredClone(source);
  const context = { revision: '1', geo: null };
  const directory = directoryAdminAddress(1, source, context);
  assert.equal(directory.fields.editorialAddress, source.address);
  assert.deepEqual(source, before);
  const event = eventAdminAddress(2, { region: 'Nitriansky kraj', city: 'Nitra', address: 'Park', venue: 'Areál' }, context);
  assert.equal(event.fields.district, null);
  assert.equal(event.fields.street, null);
  const legacy = eventAdminAddress(3, { region: 'Starý kraj', city: 'Staré mesto' }, context);
  assert.equal(legacy.locationMode, 'PHYSICAL');
  assert.equal(evaluateAdminAddress(legacy).state, 'NEEDS_REVIEW');
  const organization = organizationAdminAddress({ id: 7, organizationId: 9, role: 'SERVICE_AREA', label: '', region: 'Nitriansky kraj', district: '', city: '', countryCode: 'SK', address: '', isPrimary: true, sortOrder: 0 }, context);
  assert.equal(organization.target.targetId, 7);
  assert.equal(organization.target.organizationId, 9);
  assert.equal(organization.locationMode, 'SERVICE_AREA');
  assert.equal(evaluateAdminAddress(organization).state, 'NOT_APPLICABLE');
});
test('Online is a mode, not a ninth region; contradictory physical data requires review', () => {
  const context = { revision: '1', geo: null };
  const a = eventAdminAddress(2, { region: 'Online', city: 'online', address: '' }, context);
  assert.equal(a.locationMode, 'ONLINE');
  assert.equal(a.fields.region, null);
  assert.equal(evaluateAdminAddress(a).state, 'NOT_APPLICABLE');
  assert.equal(evaluateAdminAddress(eventAdminAddress(2, { region: 'Online', city: 'Nitra' }, context)).state, 'NEEDS_REVIEW');
  assert.equal(preview(a, { street: set('Hlavná') }).status, 'CONFLICT');
});
test('missing, omitted, undefined and unchanged are no-ops; clear requires admin reason', () => {
  const a = snapshot();
  for (const patch of [{}, { street: undefined }, { street: { kind: 'missing' } }, { street: { kind: 'unchanged' } }, { postalCode: set('09501') }]) assert.equal(preview(a, patch).status, 'NOOP');
  assert.equal(preview(a, { houseNumber: set('') }).status, 'CONFLICT');
  assert.equal(preview(a, { houseNumber: { kind: 'clear', reason: 'Remove wrong number' } }).status, 'CONFLICT');
  assert.equal(preview(a, { houseNumber: { kind: 'clear', reason: '' } }, 'ADMIN').status, 'CONFLICT');
  const cleared = preview(a, { houseNumber: { kind: 'clear', reason: 'Numberless park' } }, 'ADMIN');
  assert.equal(cleared.status, 'READY');
  assert.equal(cleared.fields.houseNumber, null);
  assert.equal(a.fields.houseNumber, '1127/21');
});
test('imports fill missing values only; normalized identity is a no-op; partial relocation is blocked', () => {
  const a = snapshot({ postalCode: '' });
  assert.equal(preview(a, { postalCode: set('09501') }).status, 'READY');
  assert.equal(preview(a, { city: set('zlate moravce') }).status, 'NOOP');
  assert.ok(has(preview(a, { houseNumber: set('12/A') }), 'EXISTING_VALUE'));
  assert.ok(has(preview(a, { region: set('Žilinský kraj'), district: set('Žilina'), city: set('Žilina') }, 'ADMIN'), 'PARTIAL_RELOCATION'));
  assert.ok(has(preview(a, { street: set('Nová') }, 'ADMIN'), 'PARTIAL_RELOCATION'));
});
test('current and stale Google IDs, fingerprints, manual override, privacy and confirmation are immutable', () => {
  for (const point of [geo, { ...geo, googlePlaceSourceFingerprint: 'old' }, { ...geo, manualOverride: true }, { ...geo, publicVisibility: 'HIDDEN' }]) {
    const a = snapshot({}, point);
    const before = structuredClone(a);
    const result = preview(a, { houseNumber: set('12/A') }, 'ADMIN');
    assert.equal(result.status, 'CONFLICT');
    assert.deepEqual(result.fields, a.fields);
    assert.deepEqual(a, before);
    assert.equal(preview(a, { houseNumber: set('1127/21') }).status, 'NOOP');
  }
  assert.equal(adminAddressPlaceState(snapshot({}, geo)), 'CURRENT');
  for (const change of [{ resolvedSourceFingerprint: 'old' }, { googlePlaceSourceFingerprint: null }, { latitude: NaN }, { publicPrecision: 'MUNICIPALITY' }, { googlePlaceMatchedAt: null }]) assert.equal(adminAddressPlaceState(snapshot({}, { ...geo, ...change })), 'STALE');
  assert.ok(has(preview(snapshot({ serviceAddressConfirmation: 'CONFIRMED_SERVICE_LOCATION' }), { houseNumber: set('12/A') }, 'ADMIN'), 'CONFIRMED_SERVICE_ADDRESS'));
  assert.ok(has(preview(snapshot({}, { ...geo, googlePlaceId: null, manualOverride: true }), { houseNumber: set('12/A') }), 'MANUAL_OVERRIDE'));
  assert.ok(has(preview(snapshot({}, { ...geo, googlePlaceId: null, publicVisibility: 'HIDDEN' }), { houseNumber: set('12/A') }), 'PRIVATE_LOCATION'));
});
test('wrong target, organization parent, stale revision and fingerprint fail closed; system fields cannot be patched', () => {
  const a = snapshot({}, geo);
  for (const changedGuard of [{ ...guard(a), revision: 'old' }, { ...guard(a), sourceFingerprint: 'old' }, { ...guard(a), target: { ...a.target, targetId: 2 } }, { ...guard(a), target: { ...a.target, organizationId: 9 } }]) assert.equal(previewAdminAddressPatch(a, {}, changedGuard).status, 'CONFLICT');
  for (const field of ['googlePlaceId', 'sourceFingerprint', 'publicVisibility', 'locationMode', 'locationRole']) assert.ok(has(preview(a, { [field]: set('bad') }), 'SYSTEM_OWNED_OR_UNKNOWN_FIELD'));
  for (const operation of [null, { kind: 'bogus' }, { kind: 'set', value: 12 }]) assert.equal(preview(a, { street: operation }).status, 'CONFLICT');
});
test('incomplete Google is a proposal, missing components never clear existing values or confirm GEO', () => {
  const candidate = { id: 'new-place', formattedAddress: '', latitude: 48, longitude: 18, address: { region: '', district: '', locality: '', sublocality: '', postalCode: '09501', street: '', houseNumber: '', countryCode: 'SK' } };
  const proposal = googleAdminAddressProposal(candidate);
  assert.equal(proposal.kind, 'PROPOSAL');
  assert.equal(proposal.patch.street.kind, 'missing');
  assert.equal(proposal.patch.houseNumber.kind, 'missing');
  assert.equal(proposal.patch.addressFormat.kind, 'missing');
  const a = snapshot({ postalCode: '' });
  const result = preview(a, proposal.patch);
  assert.equal(result.status, 'READY');
  assert.equal(result.fields.houseNumber, '1127/21');
  assert.equal(a.geo, null);
  const unknown = googleAdminAddressProposal({ ...candidate, address: { ...candidate.address, locality: 'Unknown town' } });
  assert.equal(unknown.requiresReview, true);
  assert.equal(unknown.patch.city.kind, 'missing');
  const foreign = googleAdminAddressProposal({ ...candidate, address: { ...candidate.address, countryCode: 'CZ' } });
  assert.equal(foreign.requiresReview, true);
  assert.equal(foreign.patch.postalCode.kind, 'missing');
});
test('Google district prefix and city parts resolve, incomplete relocation and private roles need review', () => {
  assert.equal(normalizeAdminAddress({ district: 'Okres Zlate Moravce' }).fields.district, 'Zlaté Moravce');
  const candidate = { id: 'new', formattedAddress: 'Nová adresa', latitude: 48, longitude: 18, address: { region: 'Žilinský kraj', district: 'Žilina', locality: 'Žilina', sublocality: 'Neznáma štvrť', postalCode: '', street: '', houseNumber: '', countryCode: 'SK' } };
  const proposal = googleAdminAddressProposal(candidate);
  assert.deepEqual(proposal.patch.city, set('Žilina'));
  assert.ok(has(preview(snapshot(), proposal.patch, 'ADMIN'), 'PARTIAL_RELOCATION'));
  const privateLocation = snapshot({ targetType: 'ORGANIZATION_LOCATION', locationRole: 'LEGAL_SEAT', organizationId: 10, postalCode: '' });
  assert.ok(has(preview(privateLocation, { postalCode: set('09501') }), 'LEGAL_SEAT_REVIEW'));
  assert.equal(adminAddressPlaceState(snapshot({ targetType: 'ORGANIZATION_LOCATION', locationRole: 'LEGAL_SEAT' }, geo)), 'STALE');
  assert.equal(adminAddressPlaceState(snapshot({ targetType: 'ORGANIZATION_LOCATION', locationRole: 'SITE' }, geo)), 'CURRENT');
});
