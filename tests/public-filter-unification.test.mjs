import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function load(path, extra = {}) {
 const exports = {};
 const code = ts.transpileModule(read(path), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
 new Function('require', 'exports', code)(name => {
  if (name === 'react') return React;
  if (name === 'react/jsx-runtime') return jsx;
  if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
  if (name in extra) return extra[name];
  throw new Error('Unexpected import ' + name);
 }, exports);
 return exports;
}
const controls = load('components/public-visual-system/public-form-controls.tsx');
const render = (component, props, ...children) => renderToStaticMarkup(React.createElement(component, props, ...children));
test('context controls retain native GET values, constraints, labels and callback/ref identity', () => {
 const onChange = () => {};
 const ref = React.createRef();
 const element = controls.PublicTextInput({appearance:'context', name:'mesto', defaultValue:'Nitra', maxLength:120, required:true, ref, onChange});
 assert.equal(element.type,'input');
 assert.equal(element.props.onChange,onChange);
 assert.equal(element.props.ref,ref);
 assert.equal(element.props.appearance,undefined);
 assert.equal(element.props.className,'');
 const html=render(controls.PublicTextInput,{appearance:'context',name:'od',type:'date',defaultValue:'2026-10-23',disabled:true,'aria-label':'Dátum od'});
 for(const fragment of ['type="date"','name="od"','value="2026-10-23"','disabled=""','aria-label="Dátum od"']) assert.ok(html.includes(fragment),fragment);
 const select=render(controls.PublicSelect,{appearance:'context',name:'region',defaultValue:'NR'},React.createElement('option',{value:''},'Všetky'),React.createElement('option',{value:'NR'},'Nitra'));
 assert.match(select, /<option value="NR" selected="">Nitra<\/option>/);
 assert.doesNotMatch(select,/class="control|appearance=/);
 assert.match(render(controls.PublicTextInput,{name:'lokalita'}),/class="control"/,'existing default form appearance is unchanged');
 const choice=render(controls.PublicChoiceInput,{type:'radio',name:'typ',value:'Všetky',defaultChecked:true});
 assert.match(choice,/type="radio"/); assert.match(choice,/checked=""/); assert.match(choice,/name="typ"/);
});
test('listing and search controls share primitives while hidden GET state remains native', () => {
 for(const name of ['directory-filter-form','directory-club-filters','breed-browser','article-browser','help-browser','adoption-catalog','event-listing-results','lost-found-dogs-page','breed-comparison','home-portal-search','section-hero-search','site-header','map/map-experience']) {
  const source=read('components/'+name+'.tsx');
  assert.match(source,/Public(?:Select|TextInput)/,name);
  const ast=ts.createSourceFile(name+'.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node) {
   if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
    const tag=node.tagName.getText(ast);
    assert.notEqual(tag,'select',name+' must use PublicSelect');
    if(tag==='input') assert.ok(node.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.text==='type'&&p.initializer?.text==='hidden'),name+' only hidden inputs remain native');
   }
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
});
test('report pagination preserves text current page, arrows and omitted disabled controls', () => {
 const {PublicPagination,PublicFilterTag}=load('components/public-visual-system/public-result-states.tsx',{'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}});
 const html=render(PublicPagination,{variant:'reports',label:'Stránkovanie hlásení',currentPage:1,totalPages:3,nextHref:'?strana=2',nextLabel:'→',nextAriaLabel:'Ďalšia strana',numberedPages:[1,2,3],pageHref:n=>'?strana='+n,currentPageAsText:true,showDisabledControls:false});
 assert.match(html,/<span aria-current="page">1<\/span>/);
 assert.doesNotMatch(html,/aria-disabled|href="\?strana=1"/);
 assert.match(html,/aria-label="Ďalšia strana"/);
 assert.equal(render(PublicPagination,{currentPage:1,totalPages:1}), '');
 const tag=render(PublicFilterTag,{href:'/adresar?region=Nitra',removeLabel:'Odstrániť filter'},'Kraj');
 assert.match(tag,/<a /);assert.match(tag,/href="\/adresar\?region=Nitra"/);assert.match(tag,/aria-label="Odstrániť filter"/);
});
