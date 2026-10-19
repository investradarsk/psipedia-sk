import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

// Real components, CSS and public snapshots. Only platform boundaries are mocked;
// no D1, Google API or production writes. Synthetic variants are named explicitly.
test('unified public details: responsive layout, honest media/data, actions and accessibility', { timeout: 240000 }, async () => {
 const dir = await mkdtemp(join(tmpdir(), 'public-details-v2-'));
 let browser;
 try {
 await build({ stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import fixtures from './tests/fixtures/unified-public-details-v2.json';
 import {DirectoryProfileDetail} from './components/directory-profile-detail';
 import {EventDetail} from './components/event-detail';
 import {buildPublicEventPresentation} from './lib/events';
 import {AdoptionDetail} from './components/adoption-detail';
 import {HelpDetailShell, HelpSection} from './components/help-details/help-detail-shell';
 import {LostFoundDogDetail} from './components/lost-found-dog-detail';
 import {OrganizationProfileDetail} from './components/organization-profile-detail';
 import {SiteHeader} from './components/site-header';
 import {defaultNavigationItems} from './lib/navigation';
 import './app/globals.css'; import './app/design-system.css'; import './app/navigation-loading.css'; import './app/navigation-hotfix.css';
 const name = new URLSearchParams(location.search).get('case') || 'directory';
 const minimal = name.includes('minimal');
 const runtime = {googleApiKey:'',googleMapId:'',rendererEnabled:true,testRendererEnvironment:true};
 const map = {...fixtures.maps.directory,...runtime};
 let view;
 if(name.startsWith('directory')) view=<DirectoryProfileDetail presentation={{...fixtures.directory,...(minimal?{imageUrl:null,phone:null,emails:[],websites:[],services:[],openingHours:'',address:'',health:null}:{}),...(name.includes('blur')?{detailImageDisplay:{mode:'blur',x:50,y:50,zoom:1}}:{}),...(name.includes('crop')?{detailImageDisplay:{mode:'crop',x:30,y:40,zoom:1.2}}:{}),...(name.includes('long')?{name:'Test dlhého názvu služby a nepretržitého kontaktu '.repeat(4)}:{})}} reviews={fixtures.review} publicMap={minimal?undefined:map}/>;
 else if(name.startsWith('event')) view=<EventDetail event={buildPublicEventPresentation({...fixtures.event,...(minimal?{imageUrl:null,organizer:'',websiteUrl:'',registrationUrl:''}:{}),...(name.includes('cancelled')?{cancelled:true}:{}),...(name.includes('long')?{title:'Test dlhého názvu kynologického podujatia a organizačných údajov '.repeat(3)}:{})})} publicMap={minimal?undefined:{...fixtures.maps.event,...runtime}}/>;
 else if(name.startsWith('adoption')) view=<AdoptionDetail dog={{...fixtures.adoption,...(minimal?{mainImage:null,contactPhone:'',contactEmail:''}:{}),...(name.includes('reserved')?{status:'RESERVED'}:{}),...(name.includes('breed-duplicate')?{breedMix:true,breedName:'kríženec'}:{})}} organization={fixtures.organizationLink}/>;
 else if(name.startsWith('help')) {
 const category=name.split('-').slice(1).join('-');
 const item={id:1,slug:'synthetic-fixture',title:'Test rozloženia pomoci psom',category,status:'published',excerpt:'Testovací prípad bez fotografie a bez dopĺňania neoverených údajov.',description:'Testovací popis.',organization:'',dogName:'',breed:'',ageNote:'',city:'Trnava',region:'Trnavský kraj',locationNote:'',reportedDate:null,deadlineDate:null,actionLabel:'Podporiť výzvu',actionUrl:'https://example.test/support',contactNote:'',goalAmount:null,raisedAmount:null,imageUrl:null,imageKey:null,verified:false,urgent:false,resolved:false,createdAt:'2026-10-18',updatedAt:'2026-10-18',publishedAt:'2026-10-18',createdBy:'',updatedBy:''};
 view=<HelpDetailShell item={item} sidebar={<HelpSection title="Kontakt"><p>Testovací verejný kontakt.</p></HelpSection>}><HelpSection title="O prípade"><p>{item.description}</p></HelpSection></HelpDetailShell>;
 } else if(name==='organization') {
 const organization={id:1,name:'Test organizácie',slug:'test-organizacie',legalName:'',registrationNumber:'',type:'CIVIC_ASSOCIATION',shortDescription:'Test minimálneho profilu bez fotografie.',description:'Test rozloženia hlavného obsahu organizácie.',publicEmail:'',publicPhone:'',websiteUrl:'',facebookUrl:'',instagramUrl:'',city:'Trnava',district:'Trnava',region:'Trnavský kraj',countryCode:'SK',locations:[],imageUrl:null,sourceUrl:'',publishedAt:'2026-10-18',lastVerifiedAt:null,updatedAt:'2026-10-18',directory:null};
 view=<OrganizationProfileDetail composition={{organization,adoptions:[],fundraisingMethods:[]}} reviews={null}/>;
 } else {
 globalThis.fixtureReport={id:1,type:'LOST',slug:'test',dogName:'Test hlásenia',status:name==='lost-resolved'?'RESOLVED':'ACTIVE',sex:'UNKNOWN',size:'UNKNOWN',breed:'',breedSlug:'',color:'',approximateAge:'',chipped:'UNKNOWN',city:'Trnava',district:'Trnava',region:'Trnavský kraj',eventDate:'2026-10-18',lastSeenDateTime:null,description:'Test verejného hlásenia bez súkromných údajov.',distinguishingMarks:'',collarDescription:'',gallery:[],mainImage:null,source:'',sourceUrl:'',publicContactNote:'',publicLatitude:null,locationDescription:'',publishedAt:'2026-10-18',createdAt:'2026-10-18',updatedAt:'2026-10-18'};
 view=await LostFoundDogDetail({type:'LOST',slug:'test'});
 }
 createRoot(document.getElementById('root')).render(<><SiteHeader navigationItems={defaultNavigationItems} partnerAuthenticated={false}/>{view}</>);
 ` }, bundle:true, format:'esm', conditions:['style'], outfile:join(dir,'app.js'), jsx:'automatic', define:{'process.env.NODE_ENV':'"production"'}, plugins:[{name:'platform-fixtures',setup(b){
 b.onResolve({filter:/^(next\/(link|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onResolve({filter:/^@\/lib\/lost-found-dog-store$/},()=>({path:'store',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/link'?`import React from 'react'; export default function Link({prefetch,replace,scroll,...props}){return React.createElement('a',props)}`:a.path==='next/navigation'?`export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search); export const useRouter=()=>({push:()=>{},prefetch:()=>{}});export const notFound=()=>{throw Error('not found')}`:a.path==='store'?`export const getPublicDogReport=async()=>globalThis.fixtureReport;`:`export const env={PROFILE_REVIEW_SUBMISSIONS_ENABLED:'1'};`}));
 }}] });
 const js=await readFile(join(dir,'app.js'),'utf8'),css=await readFile(join(dir,'app.css'),'utf8');
 browser=await chromium.launch({headless:true,...(process.env.DETAIL_TEST_CHROMIUM?{executablePath:process.env.DETAIL_TEST_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 const shots=process.env.DETAIL_TEST_SCREENSHOTS;
 if(shots) await mkdir(shots,{recursive:true});
 const sources=JSON.parse(await readFile('tests/fixtures/unified-public-details-v2.json','utf8'));
 for(const name of ['directory','event','adoption','directory-minimal','directory-blur','directory-crop','directory-long','event-minimal','event-cancelled','event-long','adoption-minimal','adoption-reserved','adoption-breed-duplicate','help-docasna-opatera','help-zbierky','help-dobrovolnictvo','help-urgentne-pripady','help-adopcia','help-stratene-a-najdene','organization','lost','lost-resolved']) {
 for(const width of ([ 'directory','event','adoption'].includes(name)?[1440,390,375,320]:[1440,320])) {
 const context=await browser.newContext({viewport:{width,height:960}}); const page=await context.newPage(); const writes=[]; let rejectInquiry=true; const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname==='fixture.test'&&url.pathname==='/') return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="sk"><head><title>Public details fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`});
 if(url.pathname==='/api/directory/inquiries') { writes.push(route.request().postDataJSON()); return route.fulfill({status:rejectInquiry?503:200,json:rejectInquiry?{error:'Test nedostupnosti API'}:{success:true}}); }
 if(url.pathname.includes('/api/name-days/today')) return route.fulfill({json:{names:[]}});
 if(url.pathname===sources.directory.imageUrl) return route.fulfill({contentType:'image/webp',body:await readFile('tests/fixtures/public-details-media/directory.webp')});
 if(url.pathname===sources.adoption.mainImage) return route.fulfill({contentType:'image/avif',body:await readFile('tests/fixtures/public-details-media/adoption.avif')});
 if(url.hostname==='fixture.test'&&!url.pathname.startsWith('/api/')) {try {const file=await readFile(join(process.cwd(),'public',url.pathname));return route.fulfill({contentType:extname(url.pathname)==='.svg'?'image/svg+xml':'image/webp',body:file});}catch{}}
 // External CACT source currently returns 403: exercise the real image-error fallback.
 return route.fulfill({status:404,body:''});
 });
 await page.goto('https://fixture.test/?case='+name);
 await page.locator('main h1').waitFor(); await page.evaluate(()=>document.fonts.ready);
 await page.locator('main img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.complete?null:new Promise(r=>{i.onload=r;i.onerror=r}))));
 assert.deepEqual(errors,[],name+' console');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,`${name} ${width} overflow ${overflow}`);
 const hero=page.locator('[data-public-detail-hero]'); assert.equal(await hero.count(),1);
 assert.equal(await page.locator('main h1').count(),1);
 const image=hero.locator('[data-public-profile-media]');
 if(await image.count()) { const photo=image.locator('img:not([aria-hidden="true"])').last(); const photoBox=await photo.boundingBox(); assert.ok(photoBox&&photoBox.width>0&&photoBox.height>0,`${name} ${width} actual image must have nonzero dimensions`); const m=await image.boundingBox(),h=await hero.locator('h1').boundingBox();if(width>800)assert.ok(m.x>h.x,`${name} desktop media right`);else assert.ok(m.y<h.y,`${name} mobile media first`);}
 if(name==='organization') { const body=await page.locator('[data-public-profile-body]').boundingBox(); const aside=await page.locator('[data-public-profile-sidebar]').boundingBox(); if(width<=800) assert.ok(body.y+body.height<=aside.y+2,'organization content precedes sidebar on mobile'); else assert.ok(aside.x>body.x,'organization desktop sidebar on right'); }
 if(name.startsWith('adoption')) assert.ok(!/\b0 kg\b/.test(await page.locator('main').innerText()),'unknown weight hidden');
 if(name==='adoption-breed-duplicate') assert.doesNotMatch(await page.locator('main').innerText(),/Kríženec\s*·\s*kríženec/i,'breed mix must not duplicate name');
 if(name.includes('long')) assert.equal(await hero.locator('h1[data-long-title]').count(),1,'long titles use compact typography');
 if(name==='event-cancelled') assert.equal(await hero.locator('[data-detail-state="cancelled"]').count(),1,'cancelled state distinct from type');
 if(name==='directory' || name==='adoption') { const img=image.locator('img').last(); const size=await img.evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight,cw:i.getBoundingClientRect().width,ch:i.getBoundingClientRect().height})); assert.ok(size.w>0);assert.ok(Math.abs(size.cw/size.ch-size.w/size.h)<.02,'natural image ratio preserved'); }
 if(name.includes('minimal')&&!name.startsWith('event')) assert.equal(await image.count(),0);
 if(name==='event-minimal') assert.equal(await image.locator('[data-event-image-source="fallback"]').count(),1,'existing event illustration retained');
 if(name==='help-zbierky') assert.equal(await hero.locator('a[href="https://example.test/support"]').count(),0,'unverified fundraising gate preserved');
 const axe=await new AxeBuilder({page}).include('main#obsah').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${name} ${width} accessibility`);
 const action=hero.locator('a').last();await action.focus();assert.equal(await action.evaluate(n=>document.activeElement===n),true,'keyboard focus');
 await action.blur();
 if(shots&&(['directory','event','adoption'].includes(name)||width===320)) await page.screenshot({path:join(shots,`${name}-${width}.png`),fullPage:true});
 if(name==='directory'&&width===390) {
 assert.equal(writes.length,0,'view is read only');
 const primary=hero.locator('[data-profile-primary-action]'); await primary.focus();await page.keyboard.press('Enter');
 assert.ok(page.url().endsWith('#kontakt'),'primary scroll target preserved');
 await page.getByLabel('Meno a priezvisko',{exact:true}).fill('Testovací používateľ');
 await page.getByLabel('E-mail',{exact:true}).fill('fixture@example.test');
 await page.getByLabel(/^Správa/).fill('Testovací dopyt bez produkčného zápisu.');
 await page.locator('.directory-contact-consent input').check();
 await page.getByRole('button',{name:'Odoslať dopyt cez Psipediu',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Test nedostupnosti API'}).waitFor();
 assert.equal(await page.getByLabel('Meno a priezvisko',{exact:true}).inputValue(),'Testovací používateľ','failed submission retains input');
 rejectInquiry=false;
 await page.getByRole('button',{name:'Odoslať dopyt cez Psipediu',exact:true}).click();
 await page.getByRole('status').filter({hasText:'sme prijali'}).waitFor();
 assert.equal(writes.length,2);assert.equal(writes[0].profileId,425);assert.equal(writes[0].submissionKey,writes[1].submissionKey,'idempotent retry unchanged');
 assert.equal(await page.getByLabel('Meno a priezvisko',{exact:true}).inputValue(),'');
 await page.getByTestId('detail-map-consent-gate').getByRole('button').click();
 await page.getByTestId('detail-map-consent-gate').waitFor({state:'hidden'});
 assert.equal(writes.length,2,'map consent never submits inquiries');
 }
 await context.close();
 }
 }
 } finally {await browser?.close();await rm(dir,{recursive:true,force:true});}
});
