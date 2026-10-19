import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';import path from 'node:path';
import {build} from 'esbuild';import {chromium,expect} from '@playwright/test';
import {fixture,png} from './facebook-image-test-fixture.mjs';
import {GET,POST} from '../app/api/admin/facebook-images/route.ts';
import {GET as detail,PUT} from '../app/api/admin/facebook-images/[id]/route.ts';
import {POST as upload} from '../app/api/admin/uploads/route.ts';
import {GET as getPublisher,PUT as putPublisher} from '../app/api/admin/facebook-images/publisher/route.ts';
import {PUT as putApproval} from '../app/api/admin/facebook-images/[id]/approval/route.ts';
import {DELETE as permanentDelete} from '../app/api/admin/facebook-images/[id]/trash/route.ts';

test('desktop/mobile real component + SQLite/API fixture: popup, upload, scheduling, reload, unsaved changes and conflict',async t=>{
 const {sqlite,images}=fixture(t);const dir=path.resolve('outputs/facebook-image-ui');mkdirSync(dir,{recursive:true});
 writeFileSync(path.join(dir,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{AdminFacebookImages}from'../../components/admin-facebook-images';import'../../app/globals.css';import'../../app/admin/admin-legacy-scoped.css';import'../../app/admin/admin-workspace.css';createRoot(document.getElementById('root')!).render(<div data-admin-workspace><main className="admin-root" style={{padding:12,fontFamily:"Arial, sans-serif"}}><h1>Facebook obrázky · testovacia fixture</h1><AdminFacebookImages initial={{items:[],calendar:[],page:1,pages:1,total:0}} initialMonth="2026-10"/></main></div>);`);
 await build({entryPoints:[path.join(dir,'entry.tsx')],outfile:path.join(dir,'entry.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',conditions:['style'],external:['/images/*','/fonts/*','/media/*','/pwa/*']});
 let deleteCalls=0;let failNextDelete=false;
 const server=createServer(async(req,res)=>{try{
  const base=`http://localhost:${server.address().port}`;const url=new URL(req.url,base);let response;
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
   if(url.pathname==='/api/admin/uploads')response=await upload(request);
   else if(url.pathname==='/api/admin/facebook-images')response=req.method==='GET'?await GET(request):await POST(request);
   else if(url.pathname==='/api/admin/facebook-images/publisher')response=req.method==='GET'?await getPublisher():await putPublisher(request);
   else if(url.pathname.endsWith('/approval'))response=await putApproval(request,{params:Promise.resolve({id:url.pathname.split('/').at(-2)})});
   else if(url.pathname.endsWith('/trash')){deleteCalls++;response=failNextDelete
     ?Response.json({error:"Simulované zlyhanie API."},{status:503})
     :await permanentDelete(request,{params:Promise.resolve({id:url.pathname.split('/').at(-2)})});}
   else{const params=Promise.resolve({id:url.pathname.split('/').at(-1)});response=req.method==='GET'?await detail(request,{params}):await PUT(request,{params});}
  }else if(url.pathname.startsWith('/media/')){const obj=images.get(url.pathname.slice(7));response=obj?new Response(obj.body,{headers:{'content-type':obj.httpMetadata.contentType}}):new Response('',{status:404});}
  else if(url.pathname==='/entry.js'||url.pathname==='/entry.css')response=new Response(readFileSync(path.join(dir,url.pathname.slice(1))),{headers:{'content-type':url.pathname.endsWith('.css')?'text/css':'text/javascript'}});
  else response=new Response('<!doctype html><html lang="sk"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/entry.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>',{headers:{'content-type':'text/html'}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(String(error));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});t.after(()=>browser.close());
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Los_Angeles'});const page=await context.newPage();
  await page.goto(`http://localhost:${server.address().port}`);await expect(page.getByRole('button',{name:'Vytvoriť príspevok',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Vytvoriť príspevok 2026-10-25',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Dátum',{exact:true})).toHaveValue('2026-10-25');
  await dialog.getByLabel('Názov',{exact:true}).fill(`Príspevok ${width}`);await dialog.getByLabel('Popis na Facebook',{exact:true}).fill('Uložený popis');
  await dialog.getByLabel(/Obrázok \(JPG/).setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(png)});
  await expect(dialog.getByAltText('Náhľad Facebook obrázka')).toBeVisible();
  await expect.poll(()=>dialog.getByAltText('Náhľad Facebook obrázka').evaluate(e=>e.naturalWidth)).toBeGreaterThan(0);
  await dialog.getByLabel('Čas (Bratislava)',{exact:true}).fill('02:30');await dialog.getByLabel(/Ak sa hodina/).selectOption('later');
  await page.screenshot({path:path.join(dir,`editor-${width}.png`)});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  await dialog.getByRole('button',{name:'Uložiť naplánovanie',exact:true}).click();await expect(dialog).not.toBeVisible();
  const row=sqlite.prepare('SELECT * FROM facebook_image_posts WHERE title=?').get(`Príspevok ${width}`);assert.equal(row.scheduled_at,'2026-10-25T01:30:00.000Z');assert.equal(row.status,'scheduled');
  const calendar=page.getByRole('region',{name:'Kalendár Facebook obrázkov'});
  const dateControl=calendar.getByRole('button',{name:'Zobraziť príspevky 2026-10-25',exact:true});
  await expect(dateControl).toBeVisible();
  const cellHeight=await dateControl.evaluate(button=>button.parentElement.getBoundingClientRect().height);
  assert.ok(cellHeight<=(width>600?95:60),`Calendar too tall at ${width}px: ${cellHeight}px`);
  if(width<=600)await dateControl.click();
  await expect(calendar.getByRole('button').filter({hasText:`Príspevok ${width}`})).toBeVisible();
  await expect(page.locator('article button').filter({hasText:`Príspevok ${width}`})).toBeEnabled();await page.locator('article button').filter({hasText:`Príspevok ${width}`}).click();await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Popis na Facebook',{exact:true})).toHaveValue('Uložený popis');await expect(dialog.getByLabel('Čas (Bratislava)',{exact:true})).toHaveValue('02:30');
  await expect(dialog.getByRole('button',{name:'Povoliť publikovanie',exact:true})).toBeEnabled();
  await dialog.getByRole('button',{name:'Povoliť publikovanie',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Odvolať povolenie publikovania'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Udeliť súhlas majiteľa'})).toBeEnabled();
  await dialog.getByRole('button',{name:'Udeliť súhlas majiteľa'}).click();
  assert.equal(sqlite.prepare('SELECT approval_status FROM facebook_image_posts WHERE id=?').get(row.id).approval_status,'APPROVED');
  assert.equal(sqlite.prepare('SELECT direct_publish_consent FROM facebook_image_posts WHERE id=?').get(row.id).direct_publish_consent,1);
  await page.screenshot({path:path.join(dir,`controls-${width}.png`)});
  const editorDelete=dialog.getByRole('button',{name:'Natrvalo odstrániť z Psipedie',exact:true});
  await expect(editorDelete).toBeEnabled();await editorDelete.click();
  const confirmDialog=page.getByRole('dialog',{name:'Natrvalo odstrániť príspevok?'});
  await expect(confirmDialog).toBeVisible();await expect(confirmDialog).toContainText('plánovanej publikačnej fronty');
  const safeCancel=confirmDialog.getByRole('button',{name:'Zrušiť',exact:true});
  const destructiveConfirm=confirmDialog.getByRole('button',{name:'Natrvalo odstrániť',exact:true});
  await expect(safeCancel).toBeFocused();
  // Capture the real browser document.activeElement, not just React props or markup.
  await expect.poll(()=>page.evaluate(()=>({
    tag:document.activeElement?.tagName,
    text:document.activeElement?.textContent?.trim(),
    marked:document.activeElement?.getAttribute('data-admin-autofocus'),
  })),{message:`Actual document.activeElement when deletion modal opens at ${width}px`})
    .toEqual({tag:'BUTTON',text:'Zrušiť',marked:'true'});
  await page.keyboard.press('Tab');await expect(destructiveConfirm).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(safeCancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirmDialog.getByRole('button',{name:'Zavrieť dialóg'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(safeCancel).toBeFocused();
  for(const action of [safeCancel,destructiveConfirm]){
    const rect=await action.evaluate(el=>{const r=el.getBoundingClientRect();return{
      left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
      viewportWidth:window.innerWidth,viewportHeight:window.innerHeight};});
    assert.ok(rect.width>=44&&rect.height>=44,`Confirmation action too small at ${width}px: ${JSON.stringify(rect)}`);
    assert.ok(rect.left>=0&&rect.right<=rect.viewportWidth&&rect.top>=0&&rect.bottom<=rect.viewportHeight,
      `Confirmation action outside viewport at ${width}px: ${JSON.stringify(rect)}`);
  }
  await page.screenshot({path:path.join(dir,`delete-confirm-${width}.png`)});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  await page.keyboard.press('Escape');await expect(confirmDialog).not.toBeVisible();
  await expect(editorDelete).toBeFocused();
  assert.equal(sqlite.prepare('SELECT deleted_at FROM facebook_image_posts WHERE id=?').get(row.id).deleted_at,null);
  await dialog.getByLabel('Popis na Facebook',{exact:true}).fill('Neuložený popis');
  await expect(editorDelete).toBeDisabled();
  await expect(dialog).toContainText('Najprv ulož alebo zahoď neuložené zmeny.');
  page.once('dialog',d=>d.dismiss());await dialog.getByRole('button',{name:'Zavrieť',exact:true}).click();await expect(dialog).toBeVisible();
  page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  sqlite.prepare('UPDATE facebook_image_posts SET version=version+1,caption=? WHERE id=?').run('Novšia úprava',row.id);
  await dialog.getByRole('button',{name:'Uložiť koncept',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('medzičasom');await expect(dialog.getByLabel('Popis na Facebook',{exact:true})).toHaveValue('Neuložený popis');
  page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Zavrieť',exact:true}).click();await expect(dialog).not.toBeVisible();
  await page.locator('article button').filter({hasText:`Príspevok ${width}`}).click();await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Popis na Facebook',{exact:true})).toHaveValue('Novšia úprava');
  await dialog.getByRole('button',{name:'Zrušiť naplánovanie',exact:true}).click();await expect(dialog).not.toBeVisible();
  assert.equal(sqlite.prepare('SELECT scheduled_at FROM facebook_image_posts WHERE id=?').get(row.id).scheduled_at,null);
  assert.equal(sqlite.prepare('SELECT direct_publish_consent FROM facebook_image_posts WHERE id=?').get(row.id).direct_publish_consent,0);
  assert.equal(sqlite.prepare('SELECT approval_status FROM facebook_image_posts WHERE id=?').get(row.id).approval_status,'UNREVIEWED');
  await page.screenshot({path:path.join(dir,`calendar-${width}.png`)});
  const permanent=page.locator('article [data-admin-action="destructive"]').last();
  await expect(permanent).toBeVisible();
  assert.ok(await permanent.evaluate(el=>el.getBoundingClientRect().height)>=44);
  await permanent.click();
  await expect(confirmDialog).toBeVisible();await expect(confirmDialog).toContainText('Koncept sa odstráni');
  await expect(confirmDialog.getByRole('button',{name:'Zrušiť',exact:true})).toBeFocused();
  await confirmDialog.getByRole('button',{name:'Zrušiť',exact:true}).click();
  await expect(confirmDialog).not.toBeVisible();await expect(permanent).toBeFocused();
  assert.equal(sqlite.prepare('SELECT deleted_at FROM facebook_image_posts WHERE id=?').get(row.id).deleted_at,null);
  await permanent.click();
  if(width===390){
    failNextDelete=true;
    await confirmDialog.getByRole('button',{name:'Natrvalo odstrániť',exact:true}).click();
    await expect(confirmDialog.getByRole('alert')).toContainText('Simulované zlyhanie API');
    assert.equal(sqlite.prepare('SELECT deleted_at FROM facebook_image_posts WHERE id=?').get(row.id).deleted_at,null);
    failNextDelete=false;
  }
  const before=deleteCalls;
  await confirmDialog.getByRole('button',{name:'Natrvalo odstrániť',exact:true})
    .evaluate(button=>{button.click();button.click();});
  await expect.poll(()=>sqlite.prepare('SELECT deleted_at FROM facebook_image_posts WHERE id=?').get(row.id).deleted_at).not.toBeNull();
  assert.equal(deleteCalls,before+1,'Double click must submit only one DELETE');
  await expect(page.locator('article button').filter({hasText:`Príspevok ${width}`})).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'natrvalo odstránený'})).toBeVisible();
  await context.close();
 }
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM facebook_image_posts WHERE facebook_post_id IS NOT NULL OR published_at IS NOT NULL').get().n,0);
});
