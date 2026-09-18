import assert from 'node:assert/strict';
const base = process.env.E2E_BASE_URL;
if (process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP !== '1' || !base || new URL(base).hostname !== 'localhost' || new URL(base).protocol !== 'http:') throw new Error('Local test fixture only.');
const get = async () => { const response=await fetch(base+'/api/admin/events');assert.equal(response.status,200);return response.json(); };
const before=await get();assert.equal(before.events.length,175);assert.equal(before.events.filter(e=>e.status==='draft').length,171);
const item=before.events.find(e=>e.id===175);assert.ok(item);
const payload={events:[{id:item.id,status:item.status,eventType:item.eventType,cancelled:item.cancelled,updatedAt:'stale'}],field:'status',value:'published',confirmedCount:1};
for (const [origin,body,expected] of [['https://untrusted.example',payload,403],[base,payload,409],[base,{...payload,confirmedCount:2},409]]) {
 const response=await fetch(base+'/api/admin/events/bulk',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal(response.status,expected,await response.text());
}
assert.deepEqual(await get(),before);
for(const path of ['/admin/podujatia','/admin/podujatia/175']) {
 const response=await fetch(base+path);const html=await response.text();assert.equal(response.status,200,path);assert.ok(html.includes(path.endsWith('175')?'Podrobný popis':'Hľadať podujatie'));
}
console.log('PASS: actual local D1 API: 175/4/171; cross-origin, stale and count guards for generic event bulk edits; no data changed; list and editor SSR HTTP 200.');
