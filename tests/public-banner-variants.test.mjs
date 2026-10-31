import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function load(path) {
 const exports={};
 const compiled=ts.transpileModule(read(path),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const anchor=({children,icon,variant,...props})=>React.createElement('a',props,children,icon);
 new Function('require','exports',compiled)(name=>{
  if(name==='react/jsx-runtime')return jsx;
  if(name.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
  if(name==='next/link')return {__esModule:true,default:anchor};
  if(name.endsWith('/icons')||name.endsWith('/help-public-icons'))return {ArrowIcon:()=>null,AlertCircleIcon:()=>null};
  if(name.endsWith('/page-system'))return {PageContainer:({children,...props})=>React.createElement('div',props,children)};
  if(name==='./public-visual-system')return {PublicActionLink:anchor};
  if(name==='./public-magazine-banner')return load('components/public-visual-system/public-magazine-banner.tsx');
  if(name==='./public-photo-callout')return load('components/public-visual-system/public-photo-callout.tsx');
  if(name==='@/lib/help-banner-presets')return load('lib/help-banner-presets.ts');
  if(name==='@/lib/visual-library-anchors')return load('lib/visual-library-anchors.ts');
  throw new Error(name);
 },exports);
 return exports;
}
test('homepage banner retains native content, target, landmark and CSS variant',()=>{
 const {PublicMagazineBanner}=load('components/public-visual-system/public-magazine-banner.tsx');
 const html=renderToStaticMarkup(React.createElement(PublicMagazineBanner,{title:'Názov',description:'Popis',label:'Otvoriť',href:'/adresar',testId:'services'}));
 for(const text of ['<section','home-magazine-banner magazine','data-home-banner="services"','aria-label="Názov"','<h2>Názov</h2>','href="/adresar"','class="button button--dark"'])assert.ok(html.includes(text),text);
 const css=read('components/public-visual-system/public-magazine-banner.module.css');
 assert.match(css,/max-width: 620px/);assert.match(css,/border-radius: var\(--ps-banner-radius, 18px\)/);
 assert.match(css,/\.magazine:global\(\.home-magazine-banner \.button\)/);
 assert.doesNotMatch(read('app/home-v2.module.css'),/:global\(\.home-magazine-banner/);
});
test('help banner variants retain destinations, photo tones, inherited colors and responsive actions',()=>{
 const {PublicHelpPhotoBanner,PublicHelpReportBanner,PublicHelpClosingBanner}=load('components/public-visual-system/public-help-banner.tsx');
 const report=renderToStaticMarkup(React.createElement(PublicHelpReportBanner));
 const closing=renderToStaticMarkup(React.createElement(PublicHelpClosingBanner));
 assert.match(report,/href="\/pomoc-psom\/nahlasit-psa-v-nudzi"/);
 assert.match(closing,/aria-labelledby="help-closing-cta-heading"/);assert.match(closing,/id="help-closing-cta-heading"/);
 assert.match(closing,/href="\/pomoc-psom\/dobrovolnictvo"/);
 for(const tone of ['care','rescue','volunteer']) {
  const html=renderToStaticMarkup(React.createElement(PublicHelpPhotoBanner,{promo:{eyebrow:'Téma',title:'Pomoc',text:'Popis',href:'/pomoc-psom',action:'Otvoriť',tone}}));
  assert.ok(html.includes('data-public-photo-callout="'+tone+'"'));assert.match(html,/<h2>Pomoc<\/h2>/);
 }
 const css=read('components/public-visual-system/public-magazine-banner.module.css');
 const media=read('components/public-visual-system/public-magazine-banner.tsx');
 for(const image of ['zdravie-veterinar','hero-labrador','trening-pri-nohe'])assert.ok(media.includes('/images/'+image+'.webp'));
 assert.match(css,/max-width: 620px/);assert.match(css,/min-height: 44px/);
 assert.doesNotMatch(read('components/help-public.module.css'),/\.(?:reportBanner|closingCta|overviewPromo)\b/);
});
