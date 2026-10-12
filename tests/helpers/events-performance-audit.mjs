// Cold-browser lab metrics only. Start a local production artifact with the event fixtures first.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const stage=process.argv[2]||'final';
if(!['baseline','final'].includes(stage)) throw new Error('Expected baseline or final stage.');
mkdirSync(`outputs/redesign5/${stage}`,{recursive:true});
const baseURL=process.argv[3]||'http://localhost:5175';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
for(const width of [390,1440])for(let run=0;run<3;run++){
 const context=await browser.newContext({viewport:{width,height:width===390?844:900}});
 const page=await context.newPage();
 const session=await context.newCDPSession(page);await session.send('Network.enable');await session.send('Network.setCacheDisabled',{cacheDisabled:true});
 const requests=new Map();session.on('Network.responseReceived',e=>requests.set(e.requestId,{url:e.response.url,mime:e.response.mimeType,size:0}));session.on('Network.loadingFinished',e=>{if(requests.has(e.requestId))requests.get(e.requestId).size=e.encodedDataLength;});
 await page.addInitScript(()=>{localStorage.setItem('psipedia-cookie-consent','necessary');window.metrics={lcp:0,cls:0};new PerformanceObserver(list=>{for(const entry of list.getEntries())window.metrics.lcp=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.metrics.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});});
 await page.goto(baseURL+'/podujatia?termin=vsetky&q=phase3+zilinska&kalendar=2026-10');
 await page.locator('[data-event-range]').waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(600);
 results.push(await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];const resources=performance.getEntriesByType('resource');return {width:innerWidth,ttfb:n.responseStart-n.requestStart,domContentLoaded:n.domContentLoadedEventEnd,lcp:window.metrics.lcp,cls:window.metrics.cls,htmlBytes:n.encodedBodySize,requests:resources.length,jsBytes:resources.filter(r=>r.initiatorType==='script').reduce((n,r)=>n+r.encodedBodySize,0),imageBytes:resources.filter(r=>r.initiatorType==='img').reduce((n,r)=>n+r.encodedBodySize,0),imagesLoaded:[...document.images].filter(i=>i.complete&&i.naturalWidth>0).length,imageResources:resources.filter(r=>r.initiatorType==='img').map(r=>({name:new URL(r.name).pathname,bytes:r.encodedBodySize}))};}));
 results.at(-1).wire={requests:requests.size,jsBytes:[...requests.values()].filter(r=>r.mime.includes('javascript')).reduce((n,r)=>n+r.size,0),imageBytes:[...requests.values()].filter(r=>r.mime.startsWith('image/')).reduce((n,r)=>n+r.size,0),resources:[...requests.values()]};
 await context.close();
}
await browser.close();writeFileSync(`outputs/redesign5/${stage}/performance.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>({width:r.width,ttfb:r.ttfb,lcp:r.lcp,cls:r.cls,htmlBytes:r.htmlBytes,jsBytes:r.wire.jsBytes,imageBytes:r.wire.imageBytes,requests:r.wire.requests}))));
