import assert from 'node:assert/strict';
import test from 'node:test';
import {validSitemapXml,servePublicSitemap,sitemapCacheKey,SITEMAP_FRESH_TTL_SECONDS,SITEMAP_LAST_GOOD_TTL_SECONDS} from '../lib/sitemap-edge-cache.ts';

const ns='http://www.sitemaps.org/schemas/sitemap/0.9';
const urlset='<urlset xmlns="'+ns+'"><url><loc>https://psipedia.sk/</loc></url></urlset>';
const index='<sitemapindex xmlns="'+ns+'"><sitemap><loc>https://psipedia.sk/sitemap.xml</loc></sitemap></sitemapindex>';
const req=()=>new Request('https://psipedia.sk/sitemap.xml');
const key=kind=>sitemapCacheKey(req().url,kind).url;
const origin=(body=urlset,headers={})=>async()=>new Response(body,{status:200,headers:{'content-type':'application/xml',...headers}});
const error=async()=>new Response('failed',{status:500});
function cache(){const entries=new Map(),puts=[];return {entries,puts,async match(req){return entries.get(req.url)?.clone()},async put(req,response){puts.push(req.url);entries.set(req.url,response.clone())}}}
function background(){const jobs=[];return {waitUntil(p){jobs.push(p)},async done(){await Promise.all(jobs)}}}

// All these inputs passed the simple root/closing-tag/loc regex in PR #940.
test('rejects mismatched and missing closing elements',()=>{
  for(const xml of [
    '<urlset xmlns="'+ns+'"><url><loc>https://psipedia.sk/</loc></wrong></urlset>',
    '<urlset xmlns="'+ns+'"><url><loc>https://psipedia.sk/</loc></urlset>',
    '<urlset xmlns="'+ns+'"><url><loc>https://psipedia.sk/</loc><priority>0.8</url></urlset>'
  ])assert.equal(validSitemapXml(xml),false,xml);
});
test('accepts valid urlset, sitemapindex, metadata and namespaced images',()=>{
  assert.equal(validSitemapXml(urlset),true);
  assert.equal(validSitemapXml(index),true);
  const withImage='<urlset xmlns="'+ns+'" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>https://psipedia.sk/pes</loc><lastmod>2026-10-21T12:00:00.000Z</lastmod><changefreq>monthly</changefreq><priority>0.8</priority><image:image><image:loc>https://example.org/pes.jpg</image:loc></image:image></url></urlset>';
  assert.equal(validSitemapXml(withImage),true);
});
test('rejects unknown/bad entities, illegal characters and declarations',()=>{
  for(const xml of [urlset.replace('</loc>','&unknown;</loc>'),urlset.replace('</loc>','&#0;</loc>'),urlset.replace('</loc>','&#xD800;</loc>'),urlset.replace('</loc>','\u0001</loc>'), '<!DOCTYPE root [<!ENTITY xx SYSTEM "file:///etc/passwd">]>'+urlset])assert.equal(validSitemapXml(xml),false);
  assert.equal(validSitemapXml(urlset.replace('</loc>','&amp;</loc>')),true);
});
test('rejects noncanonical, malformed, parametric and hostile loc URLs',()=>{
  for(const url of ['relative','http://psipedia.sk/','https://other.com/','https://psipedia.sk.evil.org/','https://psipedia.sk/?a=1','https://psipedia.sk/#hash'])assert.equal(validSitemapXml(urlset.replace('https://psipedia.sk/',url)),false,url);
});
test('rejects wrong XML namespace, empty sitemap, misplaced or repeated loc',()=>{
  for(const xml of ['','  ',urlset.replace(ns,'http://wrong.example/ns'),'<urlset xmlns="'+ns+'"></urlset>','<urlset xmlns="'+ns+'"><loc>https://psipedia.sk/</loc></urlset>',urlset.replace('</loc>','</loc><loc>https://psipedia.sk/again</loc>'),urlset.replace('</loc>','<x:node xmlns:x="https://example.com/extension"/></loc>')])assert.equal(validSitemapXml(xml),false);
});
test('rejects duplicate attributes, undefined namespace and unsafe PI',()=>{
  for(const xml of [urlset.replace('<url>','<url x="1" x="2">'),urlset.replace('<url>','<url><x:loc>https://psipedia.sk/</x:loc>'),urlset.replace('<url>','<url><?run x?>')])assert.equal(validSitemapXml(xml),false);
});
test('enforces 8 MiB size bound',()=>{assert.equal(validSitemapXml(urlset+' '.repeat(8*1024*1024)),false)});
test('validated XML fills both independent TTL cache slots',async()=>{
  const c=cache(),bg=background();await servePublicSitemap(req(),origin(index),c,bg);await bg.done();
  assert.equal(c.puts.length,2);
  assert.equal(c.entries.get(key('fresh')).headers.get('cache-control'),'public, max-age='+SITEMAP_FRESH_TTL_SECONDS);
  assert.equal(c.entries.get(key('last-good')).headers.get('cache-control'),'public, max-age='+SITEMAP_LAST_GOOD_TTL_SECONDS);
});
test('invalid XML never replaces the previous last-good; cold returns 502',async()=>{
  const c=cache(),bg=background();
  const invalid=urlset.replace('</loc>','</wrong>');
  assert.equal((await servePublicSitemap(req(),origin(invalid),c,bg)).status,502);
  assert.equal(c.puts.length,0);
  await servePublicSitemap(req(),origin(),c,bg);await bg.done();c.entries.delete(key('fresh'));
  const res=await servePublicSitemap(req(),origin(invalid),c,background());
  assert.equal(res.status,200);assert.equal(res.headers.get('x-psipedia-sitemap-cache'),'LAST_GOOD');
  assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(await res.text(),urlset);assert.equal(c.puts.length,2);
});
test('poisoned older fresh and last-good entries never get served',async()=>{
  const bad=urlset.replace('</loc>','</oops>');const c=cache(),bg=background();
  c.entries.set(key('fresh'),new Response(bad,{headers:{'content-type':'application/xml'}}));
  const res=await servePublicSitemap(req(),origin(),c,bg);
  assert.equal(await res.text(),urlset);
  await bg.done();c.entries.delete(key('fresh'));
  c.entries.set(key('last-good'),new Response(bad,{headers:{'content-type':'application/xml'}}));
  assert.equal((await servePublicSitemap(req(),error,c,background())).status,500);
});
test('origin HTTP 500: warm valid last-good 200; cold 500',async()=>{
  const c=cache();assert.equal((await servePublicSitemap(req(),error,c,background())).status,500);
  const bg=background();await servePublicSitemap(req(),origin(),c,bg);await bg.done();c.entries.delete(key('fresh'));
  const res=await servePublicSitemap(req(),error,c,background());
  assert.equal(res.status,200);assert.equal(res.headers.get('x-psipedia-sitemap-cache'),'LAST_GOOD');
});
test('private/no-store/no-cache, Set-Cookie and Vary:* forbid cache substitution',async()=>{
  for(const h of [{'cache-control':'private'},{'cache-control':'no-store'},{'cache-control':'no-cache'},{'set-cookie':'secret=1'},{vary:'*'}]){
    const c=cache(),bg=background();await servePublicSitemap(req(),origin(),c,bg);await bg.done();c.entries.delete(key('fresh'));
    const result=await servePublicSitemap(req(),async()=>new Response('failed',{status:500,headers:h}),c,background());
    assert.equal(result.status,500);
  }
});
test('oversized origin body is rejected before any cache write',async()=>{
  const c=cache();const response=await servePublicSitemap(req(),origin(urlset+' '.repeat(8*1024*1024)),c,background());
  assert.equal(response.status,502);assert.equal(c.puts.length,0);
});
