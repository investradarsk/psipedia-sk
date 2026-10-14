import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLostFoundDraft,assertLostFoundSchema} from '../scripts/gemini-notion-lost-found-fields.mjs';
const url='https://utulok.example.org/pripady/neo';
const types=['Názov','Typ','Psipedia stav','Meno psa','Mesto','Popis','Rozlišovacie znaky','Psipedia ID','Slug',
'Pohlavie','Plemeno','Farba','Veľkosť','Obojok','Okres','Kraj'];
const schema=Object.fromEntries(types.map(k=>[k,{type:k==='Názov'?'title':'rich_text'}]));
for(const k of ['Dátum udalosti','Vyriešené','Expirácia'])schema[k]={type:'date'};
for(const k of ['Zdroj URL','URL Psipedia'])schema[k]={type:'url'};
for(const k of ['Latitude','Longitude'])schema[k]={type:'number'};
const required=['report_type','report_status','name','dog_name','breed','color','distinguishing_marks','city','summary','description','event_date','verified_at','source_url'];
const args=()=>({report_type:'STRATENÝ',report_status:'OPEN',name:'Stratený pes Neo, Nitra',dog_name:'Neo',breed:'Labrador',
 color:'čierny',distinguishing_marks:'biela škvrna na hrudi',city:'Nitra',summary:'Stratený čierny labrador v meste Nitra.',
 description:'Pes sa stratil v Nitre. Má bielu škvrnu na hrudi a čiernu srsť. Hľadá sa.',
 event_date:'2026-10-13',verified_at:'2026-10-14',source_url:url,
 evidence:[{source_url:url,fields:required}]});
function check(next=args(),options={}) {return buildLostFoundDraft({args:next,properties:options.properties??schema,rows:options.rows??[],
 scanComplete:options.complete??true,groundedSources:options.grounded??[url],today:'2026-10-14'});}
function row(overrides={}) {const values={ 'Názov':'Stratený Neo','Typ':'LOST','Meno psa':'Neo',
 'Mesto':'Nitra','Plemeno':'Labrador','Farba':'čierny','Rozlišovacie znaky':'biela škvrna na hrudi',
 'Dátum udalosti':'2026-10-12','Zdroj URL':'https://ine.example.org/neo',...overrides};
 return {id:'mock-row',properties:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,
 {type:k==='Dátum udalosti'?'date':k==='Zdroj URL'?'url':'rich_text',
 ...(k==='Dátum udalosti'?{date:{start:v}}:k==='Zdroj URL'?{url:v}:{rich_text:[{plain_text:v}]})}]))};}
test('canonical schema required, although it cannot alone select between twin data sources',()=>{
 assert.doesNotThrow(()=>assertLostFoundSchema(schema));
 assert.throws(()=>assertLostFoundSchema({...schema,'Psipedia ID':{type:'number'}}),/SCHEMA_INVALID/);
 assert.throws(()=>check(args(),{properties:{...schema,'Zdroj URL':{type:'rich_text'}}}),/SCHEMA_INVALID/);
});
for(const [report, expected] of [['STRATENÝ','LOST'],['NÁJDENÝ','FOUND']])test('strict '+report+' draft without publication, identity or private location',()=>{
 const d=check({...args(),report_type:report});
 assert.equal(d.Typ.rich_text[0].text.content,expected);
 assert.equal(d['Psipedia stav'].rich_text[0].text.content,'DRAFT');
 assert.equal(d['Zdroj URL'].url,url);
 assert.equal(d['Dátum udalosti'].date.start,'2026-10-13');
 for(const key of ['Psipedia ID','Slug','Latitude','Longitude','URL Psipedia','Verejný kontakt','Publikované','Vyriešené'])assert.equal(d[key],undefined);
});
for(const payload of [{phone:'+421 905 123 456'},{email:'user@example.org'},{address:'Hlavná 43'},
 {latitude:48.3012},{longitude:18.0987},{psipedia_id:'1'},{description:'Stratil sa. Bydlisko: ulica Hlavná 24, Nitra.'},
 {description:'Kontaktujte ma na user@example.org a dáme vám podrobnosti.'},
 {description:'Súradnice: 48.1122, 18.3022, pes je v okolí.'},
 {source_url:'https://example.org/pripad?phone=0905111222'}]){
 test('privacy or unsupported data rejected: '+JSON.stringify(payload),()=>assert.throws(()=>check({...args(),...payload})));
}
for(const payload of [{report_status:'RESOLVED'},{report_status:'EXPIRED'},
 {event_date:'2026-09-01'},{verified_at:'2026-10-12'},{event_date:'2026-10-15'},
 {event_date:'2026-02-30'},{report_type:'UNKNOWN'},{city:''},{dog_name:'',breed:'',distinguishing_marks:''},
 {evidence:[]},{source_url:'https://unverified.example.org/neo'}]){
 test('ineligible report rejected: '+JSON.stringify(payload),()=>assert.throws(()=>check({...args(),...payload})));
}
test('incomplete Notion scan fails closed',()=>assert.throws(()=>check(args(),{complete:false}),/SCAN_INCOMPLETE/));
test('malformed Notion row fails closed',()=>assert.throws(()=>check(args(),{rows:[{id:'bad'}]}),/SCAN_INVALID/));
test('same source is duplicate even if identity or report type differs',()=>assert.throws(()=>check({...args(),report_type:'NÁJDENÝ'},
 {rows:[row({'Zdroj URL':url})]}),/DUPLICATE_OR_AMBIGUOUS/));
test('same time, city, type and phenotype rejected',()=>assert.throws(()=>check(args(),{rows:[row()]}),/DUPLICATE_OR_AMBIGUOUS/));
test('ambiguous identity with only location and date rejected',()=>assert.throws(()=>check(args(),{rows:[row({'Meno psa':'','Plemeno':'','Farba':'','Rozlišovacie znaky':''})]}),/DUPLICATE_OR_AMBIGUOUS/));
test('clearly different dogs may pass same city and date',()=>assert.doesNotThrow(()=>check(args(),{rows:[row({'Meno psa':'Rex','Plemeno':'Pudel','Rozlišovacie znaky':'jazva na nose'})]})));
test('different type and source can coexist if identity is otherwise distinct',()=>assert.doesNotThrow(()=>check(args(),{rows:[row({'Typ':'FOUND'})]})));
test('false evidence about verified date or incident fails closed',()=>{
 const partial=args();partial.evidence=[{source_url:url,fields:required.filter(x=>x!=='verified_at')}];
 assert.throws(()=>check(partial),/EVIDENCE_INCOMPLETE/);
});
