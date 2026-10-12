// Profiles actual public listing and calendar reads against local SQLite, opened read-only.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {parseEventListing} from '../../lib/event-listing.ts';
import {getPublishedEventListing,getPublicEventCalendar} from '../../lib/event-store.ts';
import {env} from 'cloudflare:workers';
const dir='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';const db=new DatabaseSync(dir+'/'+readdirSync(dir).find(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite'),{readOnly:true});
const stage=process.argv[2]||'final';
if(!['baseline','final'].includes(stage)) throw new Error('Expected baseline or final stage.');
mkdirSync(`outputs/redesign5/${stage}`,{recursive:true});
let calls=[];
env.DB={prepare(sql){const query=db.prepare(sql);return {bind(...values){return {first:async()=>{const start=performance.now(),row=query.get(...values);calls.push({kind:'count',ms:performance.now()-start,bytes:Buffer.byteLength(sql),rows:1});return row;},all:async()=>{const start=performance.now(),rows=query.all(...values);calls.push({kind:sql.includes('WITH RECURSIVE days')?'calendar':'rows',ms:performance.now()-start,bytes:Buffer.byteLength(sql),rows:rows.length});return {results:rows};}};}};}};
const report=[];
for(const [name,raw] of [['plain',{termin:'vsetky'}],['search',{termin:'vsetky',q:'phase3 zilinska'}],['search-city',{termin:'vsetky',q:'phase3 zilinska',mesto:'zilina'}]])for(let run=0;run<3;run++){
 calls=[];const f=parseEventListing(raw),start=performance.now();const [listing,calendar]=await Promise.all([getPublishedEventListing(f),getPublicEventCalendar(f,'2026-10','2026-10-15')]);
 report.push({name,run,totalMs:performance.now()-start,total:listing.total,summaryRows:calendar.summaries.length,calls});
}
db.close();writeFileSync(`outputs/redesign5/${stage}/sql.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
