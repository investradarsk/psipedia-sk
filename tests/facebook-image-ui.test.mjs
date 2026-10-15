import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';import path from 'node:path';
import {build} from 'esbuild';import {chromium,expect} from '@playwright/test';
import {fixture,png} from './facebook-image-test-fixture.mjs';
import {GET,POST} from '../app/api/admin/facebook-images/route.ts';
import {GET as detail,PUT} from '../app/api/admin/facebook-images/[id]/route.ts';
import {POST as upload} from '../app/api/admin/uploads/route.ts';

test('desktop/mobile real component + SQLite/API fixture: popup, upload, scheduling, reload, unsaved changes and conflict',async t=>{
 const {sqlite,images}=fixture(t);const dir=path.resolve('outputs/facebook-image-ui');mkdirSync(dir,{recursive:true});
 writeFileSync(path.join(dir,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{AdminFacebookImages}from'../../components/admin-facebook-images';import'../../app/globals.css';import'../../app/admin/admin-legacy-scoped.css';import'../../app/admin/admin-workspace.css';createRoot(document.getElementById('root')!).render(<div data-admin-workspace><main className="admin-root" style={{padding:12,fontFamily:"Arial, sans-serif"}}><h1>Facebook obrázky · testovacia fixture</h1><AdminFacebookImages initial={{items:[],calendar:[],page:1,pages:1,total:0}} initialMonth="2026-10"/></main></div>);`);
 await build({entryPoints:[path.join(dir,'entry.tsx')],outfile:path.join(dir,'entry.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',conditions:['style'],external:['/images/*','/fonts/*','/media/*','/pwa/*']});
 const server=createServer(async(req,res)=>{try{
  const base=`http://localhost:${server.address().port}`;const url=new URL(req.url,base);let response;
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
   if(url.pathname==='/api/admin/uploads')response=await upload(request);
   else if(url.pathname==='/api/admin/facebook-images')response=req.method==='GET'?await GET(request):await POST(request);
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
  await expect(page.getByRole('region',{name:'Kalendár Facebook obrázkov'}).getByRole('button').filter({hasText:`Príspevok ${width}`})).toBeVisible();
  await expect(page.locator('article button').filter({hasText:`Príspevok ${width}`})).toBeEnabled();await page.locator('article button').filter({hasText:`Príspevok ${width}`}).click();await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Popis na Facebook',{exact:true})).toHaveValue('Uložený popis');await expect(dialog.getByLabel('Čas (Bratislava)',{exact:true})).toHaveValue('02:30');
  await dialog.getByLabel('Popis na Facebook',{exact:true}).fill('Neuložený popis');page.once('dialog',d=>d.dismiss());await dialog.getByRole('button',{name:'Zavrieť',exact:true}).click();await expect(dialog).toBeVisible();
  page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  sqlite.prepare('UPDATE facebook_image_posts SET version=version+1,caption=? WHERE id=?').run('Novšia úprava',row.id);
  await dialog.getByRole('button',{name:'Uložiť koncept',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('medzičasom');await expect(dialog.getByLabel('Popis na Facebook',{exact:true})).toHaveValue('Neuložený popis');
  page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Zavrieť',exact:true}).click();await expect(dialog).not.toBeVisible();
  await page.locator('article button').filter({hasText:`Príspevok ${width}`}).click();await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Popis na Facebook',{exact:true})).toHaveValue('Novšia úprava');
  await dialog.getByRole('button',{name:'Zrušiť naplánovanie',exact:true}).click();await expect(dialog).not.toBeVisible();assert.equal(sqlite.prepare('SELECT scheduled_at FROM facebook_image_posts WHERE id=?').get(row.id).scheduled_at,null);
  await page.screenshot({path:path.join(dir,`calendar-${width}.png`)});await context.close();
 }
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM facebook_image_posts WHERE facebook_post_id IS NOT NULL OR published_at IS NOT NULL').get().n,0);
});
