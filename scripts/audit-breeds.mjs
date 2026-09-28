#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { auditBreedRows, breedAuditRowsSql } from '../lib/breed-audit.ts';
import { auditCanonicalIdentities } from '../lib/breed-canonical.ts';

const remote=process.argv.includes('--remote');
const file=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
if(!remote&&!file)throw new Error('Usage: node scripts/audit-breeds.mjs <D1-export.json> [--strict] | --remote [--strict]');
const source=remote?execFileSync('./node_modules/.bin/wrangler',['d1','execute','DB','--remote','--config','dist/server/wrangler.json','--command',breedAuditRowsSql,'--json'],{encoding:'utf8',maxBuffer:64*1024*1024}):readFileSync(file,'utf8');
const payload=JSON.parse(source);
const rows=Array.isArray(payload)&&payload[0]?.results?payload.flatMap(result=>result.results):payload.rows??payload;
if(!Array.isArray(rows))throw new Error('Expected D1 result rows');
const issues=auditBreedRows(rows);
const canonicalClaims=rows.filter(row=>{
  try{
    const seo=JSON.parse(row.seo_json);
    return row.status==='published'&&Number.isSafeInteger(row.fci_number)&&row.fci_number>0&&row.import_key?.trim()
      &&row.name?.trim()&&Number.isInteger(row.fci_group)&&row.fci_group>=1&&row.fci_group<=10&&/^[a-z0-9-]+$/.test(row.slug)
      &&!seo.noindex&&(!seo.canonicalUrl||seo.canonicalUrl===`https://psipedia.sk/plemena/${row.slug}`||seo.canonicalUrl===`/plemena/${row.slug}`);
  }catch{return false;}
});
const critical=[...auditCanonicalIdentities(canonicalClaims),...issues.filter(issue=>['broken-canonical-relation','invalid-seo-json'].includes(issue.code))];
console.log(JSON.stringify({checkedAt:new Date().toISOString(),source:remote?'production D1':'provided export',publishedCount:rows.filter(row=>row.status==='published').length,canonicalClaimCount:canonicalClaims.length,critical,issues,imageExistence:'Run /admin/plemena/audit to check the live R2 and asset bindings.'},null,2));
if(process.argv.includes('--strict')&&critical.length)process.exitCode=1;
