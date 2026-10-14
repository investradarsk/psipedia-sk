/**
 * Offline, fail-closed Lost/Found draft validator for the EXISTING Gemini worker.
 * Canonical target established by operator's production D1 read-only evidence
 * and cross-checked against the existing Notion page parent. No HTTP calls here.
 */
const fail = code => { throw new Error("GEMINI_LOST_FOUND_" + code); };
export const CANONICAL_LOST_FOUND_DATA_SOURCE_ID = "3ed793fc-1d18-8122-95b9-000b05c3c6bd";
export const CANONICAL_LOST_FOUND_DATABASE_ID = "811d0659-7217-4914-a27c-1cd67bda3e0e";
const uuid = value => typeof value === "string" ? value.replaceAll("-", "").toLowerCase() : "";
/** Reject other same-named Notion databases, even with an identical field schema.
 * Requires explicit variable and fresh Notion REST metadata on every snapshot.
 */
export function assertLostFoundTarget(configuredId, metadata) {
  if (uuid(configuredId) !== uuid(CANONICAL_LOST_FOUND_DATA_SOURCE_ID))
    fail("TARGET_NOT_CANONICAL");
  if (metadata !== undefined &&
      (uuid(metadata?.id) !== uuid(CANONICAL_LOST_FOUND_DATA_SOURCE_ID) ||
       uuid(metadata?.parent?.database_id) !== uuid(CANONICAL_LOST_FOUND_DATABASE_ID)))
    fail("TARGET_PARENT_INVALID");
}
const clean = (v, max = 1500) => typeof v === 'string' && v.trim().length <= max ? v.trim() : '';
const norm = v => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const rich = v => ({ rich_text: [{ type: 'text', text: { content: v } }] });
const txt = v => ({ title: [{ type: 'text', text: { content: v } }] });
const privatePattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+\s*421|\b0(?:9|[2-8]))[\s().-]*\d{2,3}[\s().-]*\d{3}[\s.-]*\d{3,4}|\b(?:gps|lat(?:itude)?|lon(?:gitude)?|s[uú]radnice)\s*[:=]?\s*-?\d{1,3}[.,]\d{3,}|\b-?\d{1,2}[.,]\d{4,}\s*[,;]\s*-?\d{1,3}[.,]\d{4,}|\b(?:ulica|ul\.|adresa|bydlisko|domu|s[uú]pisn[eé])\s*[:,-]?\s*[\p{L} .-]+\s+\d{1,4}(?:\/\d+)?\b/iu;
const disallowed = new Set(['email','phone','telephone','contact','public_contact_note','address','street',
  'house_number','postal_code','latitude','longitude','gps','coordinates','location_description',
  'private_location','exact_location','psipedia_id','slug','published_at','resolved_at','owner',
  'reporter','source_contact','state','status','ready','verified','duplicate_of_id']);
const accepted = new Set(['report_type','report_status','name','dog_name','sex','breed','color','size',
  'distinguishing_marks','collar_description','city','district','region','summary','description',
  'event_date','verified_at','source_url','source_urls','evidence']);
function dateOnly(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail('DATE_INVALID');
  const [y,m,d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y,m-1,d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m-1 || dt.getUTCDate() !== d) fail('DATE_INVALID');
  return v;
}
function sourceUrl(v) {
  if (!clean(v,2048)) fail('SOURCE_REQUIRED');
  try {
    const u = new URL(v); const host = u.hostname.toLowerCase();
    // Avoid personal contacts in URL search parameters; exclude internal and private network hosts.
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search || !host.includes('.') ||
      /^(?:\d|\[|0x)/.test(host) || /(?:^|\.)(?:localhost|local|internal)$/.test(host) ||
      host === 'psipedia.sk' || host.endsWith('.psipedia.sk') ||
      host === 'vertexaisearch.cloud.google.com' || privatePattern.test(decodeURIComponent(u.pathname))) fail('SOURCE_UNSAFE');
    return u.href;
  } catch { fail('SOURCE_UNSAFE'); }
}
const plain = (row,key) => {
  const p = row?.properties?.[key]; if (!p) return '';
  if (p.type === 'date') return p.date?.start ?? '';
  if (p.type === 'url') return p.url ?? '';
  if (p.type === 'select') return p.select?.name ?? '';
  if (p.type === 'rich_text' || p.type === 'title')
    return (p[p.type] ?? []).map(x => x.plain_text ?? x.text?.content ?? '').join('');
  return '';
};
export function assertLostFoundSchema(properties) {
  const fields = { 'Názov':'title','Typ':'rich_text','Psipedia stav':'rich_text',
    'Meno psa':'rich_text','Mesto':'rich_text','Dátum udalosti':'date',
    'Popis':'rich_text','Rozlišovacie znaky':'rich_text','Zdroj URL':'url',
    'Psipedia ID':'rich_text','URL Psipedia':'url','Slug':'rich_text',
    'Vyriešené':'date','Expirácia':'date','Latitude':'number','Longitude':'number' };
  if (!properties || Object.entries(fields).some(([k,v]) => properties[k]?.type !== v)) fail('SCHEMA_INVALID');
}
function similarIdentity(previous, candidate) {
  if (norm(plain(previous,'Typ')) !== norm(candidate.type)) return false;
  const prevCity = norm(plain(previous,'Mesto'));
  if (prevCity && prevCity !== norm(candidate.city)) return false;
  const previousDate = plain(previous,'Dátum udalosti').slice(0,10);
  if (previousDate && Math.abs(Date.parse(previousDate)-Date.parse(candidate.eventDate)) > 14*86400000) return false;
  const prevName = norm(plain(previous,'Meno psa'));
  const sameName = prevName && candidate.dogName && prevName === norm(candidate.dogName);
  const prevMarks = norm(plain(previous,'Rozlišovacie znaky'));
  const sameMarks = prevMarks && candidate.marks && prevMarks === norm(candidate.marks);
  const prevBreed = norm(plain(previous,'Plemeno'));
  const prevColor = norm(plain(previous,'Farba'));
  const sameAppearance = prevBreed && prevColor && prevBreed === norm(candidate.breed) && prevColor === norm(candidate.color);
  if (sameName || sameMarks || sameAppearance) return true;
  // Only accept another report when both identities are actually distinguishable.
  const differentiableName = prevName && candidate.dogName && prevName !== norm(candidate.dogName);
  const differentiableBreed = prevBreed && candidate.breed && prevBreed !== norm(candidate.breed);
  const differentiableMarks = prevMarks && candidate.marks && prevMarks !== norm(candidate.marks);
  return !(differentiableName && (differentiableBreed || differentiableMarks));
}
export function assertLostFoundUnique(rows, candidate, scanComplete) {
  if (scanComplete !== true || !Array.isArray(rows)) fail('SCAN_INCOMPLETE');
  for (const row of rows) {
    if (!row?.properties) fail('SCAN_INVALID');
    const previousSource = plain(row,'Zdroj URL');
    let sameSource = false;
    try { sameSource = Boolean(previousSource) && sourceUrl(previousSource) === candidate.source; } catch { /* invalid legacy URL does not prove uniqueness */ }
    if (sameSource || similarIdentity(row,candidate)) fail('DUPLICATE_OR_AMBIGUOUS');
  }
}
/** Only drafts; intentionally no Psipedia ID, slug, contact information or coordinates. */
export function buildLostFoundDraft({ args, properties, rows, scanComplete, groundedSources, today }) {
  assertLostFoundSchema(properties);
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INPUT_INVALID');
  if (Object.keys(args).some(key => !accepted.has(key) || disallowed.has(key))) fail('UNSUPPORTED_FIELD');
  const type = ({ STRATENÝ:'LOST', NÁJDENÝ:'FOUND', LOST:'LOST', FOUND:'FOUND' })[args.report_type];
  if (!type) fail('TYPE_INVALID');
  if (args.report_status !== 'OPEN') fail('NOT_OPEN');
  const fields = {
    name:clean(args.name,160),dog_name:clean(args.dog_name,120),sex:clean(args.sex,60),
    breed:clean(args.breed,100),color:clean(args.color,100),size:clean(args.size,60),
    distinguishing_marks:clean(args.distinguishing_marks,400),collar_description:clean(args.collar_description,250),
    city:clean(args.city,120),district:clean(args.district,120),region:clean(args.region,120),
    summary:clean(args.summary,320),description:clean(args.description,1300),
  };
  if (!fields.name || !fields.city || !fields.summary || fields.description.length < 30 ||
      !(fields.dog_name || fields.breed || fields.distinguishing_marks)) fail('IDENTITY_INCOMPLETE');
  if (Object.values(fields).some(v => privatePattern.test(v))) fail('PRIVATE_INFORMATION');
  const current = dateOnly(today), eventDate = dateOnly(args.event_date), verified = dateOnly(args.verified_at);
  const ageMs = Date.parse(current) - Date.parse(eventDate);
  if (ageMs < 0 || ageMs > 30 * 86400000 || verified !== current) fail('NOT_CURRENT');
  if (args.source_urls !== undefined && !Array.isArray(args.source_urls)) fail('SOURCES_INVALID');
  const rawSources = [args.source_url,...(args.source_urls ?? [])];
  if (rawSources.length > 8 || rawSources.some(x => !x)) fail('SOURCES_INVALID');
  const sources = rawSources.map(sourceUrl);
  const grounded = new Set(Array.isArray(groundedSources) ? groundedSources.map(sourceUrl) : []);
  if (sources.some(url => !grounded.has(url))) fail('SOURCE_NOT_GROUNDED');
  const allowedEvidence = new Set(['report_type','report_status','name','dog_name','sex','breed','color','size',
    'distinguishing_marks','collar_description','city','district','region','summary','description','event_date','verified_at','source_url']);
  if (!Array.isArray(args.evidence) || !args.evidence.length || args.evidence.length > 10) fail('EVIDENCE_REQUIRED');
  const supported = new Set();
  for (const item of args.evidence) {
    if (!item || !sources.includes(sourceUrl(item.source_url)) || !Array.isArray(item.fields) ||
      !item.fields.length || item.fields.some(f => !allowedEvidence.has(f))) fail('EVIDENCE_INVALID');
    item.fields.forEach(f => supported.add(f));
  }
  for (const key of ['report_type','report_status','name','city','summary','description','event_date','verified_at','source_url',
    ...Object.keys(fields).filter(k => fields[k] && !['name','city','summary','description'].includes(k))]) {
    if (!supported.has(key)) fail('EVIDENCE_INCOMPLETE');
  }
  assertLostFoundUnique(rows,{
    type, city:fields.city, dogName:fields.dog_name, breed:fields.breed, color:fields.color,
    marks:fields.distinguishing_marks, eventDate, source:sources[0],
  },scanComplete);
  const evidenceNotes = args.evidence.map(x => x.fields.join(', ') + ': ' + sourceUrl(x.source_url)).join('\n');
  const result = {
    'Názov':txt(fields.name), 'Typ':rich(type), 'Psipedia stav':rich('DRAFT'),
    'Mesto':rich(fields.city), 'Dátum udalosti':{date:{start:eventDate}},
    'Popis':rich(fields.description+'\n\nPrehľad: '+fields.summary+'\n\nDôkazy:\n'+evidenceNotes),
    'Zdroj URL':{url:sources[0]},
  };
  for (const [field,property] of Object.entries({dog_name:'Meno psa',sex:'Pohlavie',breed:'Plemeno',
    color:'Farba',size:'Veľkosť',distinguishing_marks:'Rozlišovacie znaky',collar_description:'Obojok',
    district:'Okres',region:'Kraj'})) {
    if (fields[field]) {
      if (properties[property]?.type !== 'rich_text') fail('SCHEMA_INVALID');
      result[property] = rich(fields[field]);
    }
  }
  return result;
}
