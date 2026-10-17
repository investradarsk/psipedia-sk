import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {directoryFilterRegistry,serviceFilterCategories} from "../lib/directory-filter-contract.ts";
import {
 SERVICE_CATALOG_VERSION,SERVICE_SELECTION_POLICY,TRI_STATE_VALUES,
 serviceCatalog,attributeCatalog,providerTypeCatalog,legacyFacetMappings,
 validateServiceCatalog,validateServiceCatalogContract,getServiceById,getAttributeById,getProviderTypeById,
 servicesForCategory,resolveApprovedServiceName,translateLegacyFacetValue
} from "../lib/service-catalog-contract.ts";
test("static contract: 10 categories, globally unique IDs, semantic checks",()=>{
 assert.equal(SERVICE_CATALOG_VERSION,"0.2");assert.doesNotThrow(validateServiceCatalogContract);
 assert.equal(serviceFilterCategories.length,10);assert.ok(serviceCatalog.length>=60);
 assert.equal(new Set([...serviceCatalog,...attributeCatalog,...providerTypeCatalog].map(x=>x.id)).size,serviceCatalog.length+attributeCatalog.length+providerTypeCatalog.length);
 for(const cat of serviceFilterCategories)assert.ok(servicesForCategory(cat).length>0,cat);
});
test("one global agility ID and accepted exact aliases",()=>{
 assert.equal(serviceCatalog.filter(x=>x.id==="svc.training.agility").length,1);
 assert.deepEqual(getServiceById("svc.training.agility").categories,["treneri","kynologicke-kluby"]);
 assert.equal(resolveApprovedServiceName("  AGILITY ","treneri")?.id,"svc.training.agility");
 assert.equal(resolveApprovedServiceName("Agility tréning","kynologicke-kluby")?.id,"svc.training.agility");
 assert.equal(resolveApprovedServiceName("Vodná terapia","veterinari")?.id,"svc.physio.hydrotherapy");
 assert.equal(resolveApprovedServiceName("Röntgenové vyšetrenie","veterinari")?.id,"svc.vet.xray");
});
test("unapproved broad terms and cross-category names are not inferred",()=>{
 for(const [term,cat] of [["chirurgia","veterinari"],["psia škôlka","hotely-a-opatrovanie"],["športová kynológia","kynologicke-kluby"],["pet taxi a preprava","dalsie-sluzby"],["aktívny chov","chovatelske-stanice"],["trimovanie","veterinari"],["CT","not-category"]]){
  assert.equal(resolveApprovedServiceName(term,cat),null,term);
 }
 assert.throws(()=>getServiceById("svc.test.unknown"),/Unknown canonical/);
 assert.throws(()=>getAttributeById("attr.unknown"),/Unknown canonical/);
 assert.throws(()=>getProviderTypeById("provider.unknown"),/Unknown provider/);
});
test("duplicate IDs, ambiguous aliases, category duplication rejected",()=>{
 const agile=getServiceById("svc.training.agility");
 assert.throws(()=>validateServiceCatalog([agile,agile]),/Duplicate ID/);
 assert.throws(()=>validateServiceCatalog([{...agile,categories:["treneri","treneri"]}]),/Duplicate or missing/);
 assert.throws(()=>validateServiceCatalog([agile,{...agile,id:"svc.other.agility",label:"Iné",aliases:["AGILITY"]}]),/Ambiguous alias/);
});
test("all 21 original filters map to 11 services, 9 attributes, 1 provider",()=>{
 assert.equal(legacyFacetMappings.length,21);
 assert.deepEqual(legacyFacetMappings.map(x=>x.legacyId).sort(),directoryFilterRegistry.map(x=>x.id).sort());
 assert.equal(legacyFacetMappings.filter(x=>x.targetKind==="service").length,11);
 assert.equal(legacyFacetMappings.filter(x=>x.targetKind==="attribute").length,9);
 assert.equal(legacyFacetMappings.filter(x=>x.targetKind==="provider").length,1);
 assert.equal(legacyFacetMappings.find(x=>x.legacyId==="treneri.group_training").targetId,legacyFacetMappings.find(x=>x.legacyId==="kynologicke-kluby.group_training").targetId);
 assert.ok(legacyFacetMappings.every(x=>x.mode==="lossless_explicit_only"));
});
test("explicit yes/no/unknown preserved, absent and false never become NO",()=>{
 assert.deepEqual(TRI_STATE_VALUES,["yes","no","unknown"]);
 assert.equal(translateLegacyFacetValue("salony-a-sluzby.nail_trimming","Áno").value,"offered");
 assert.equal(translateLegacyFacetValue("salony-a-sluzby.nail_trimming","nie").value,"not_offered");
 assert.deepEqual(translateLegacyFacetValue("salony-a-sluzby.nail_trimming",null),{legacyId:"salony-a-sluzby.nail_trimming",targetId:"svc.groom.nails",targetKind:"service",status:"missing",value:"unknown"});
 assert.deepEqual(translateLegacyFacetValue("salony-a-sluzby.nail_trimming",false),{legacyId:"salony-a-sluzby.nail_trimming",targetId:"svc.groom.nails",targetKind:"service",status:"invalid",value:"unknown"});
 assert.equal(translateLegacyFacetValue("veterinari.emergency","no").value,"no");
 assert.equal(translateLegacyFacetValue("veterinari.facility_type","clinic").value,"clinic");
 assert.throws(()=>translateLegacyFacetValue("bad.id","yes"),/Unknown legacy/);
});
test("different care/supervision data, kennel not sold as artificial services, default AND",()=>{
 assert.equal(getAttributeById("attr.care.supervision_mode").valueKind,"single_select");
 assert.equal(getAttributeById("attr.kennel.breeding_focus").valueKind,"multi_select");
 assert.ok(serviceCatalog.filter(x=>x.categories.includes("chovatelske-stanice")).every(x=>x.id==="svc.breeding.advice"));
 assert.equal(SERVICE_SELECTION_POLICY.defaultMode,"all");
 assert.deepEqual(SERVICE_SELECTION_POLICY.supportedModes,["all","any"]);
});
test("contract is not imported by live writers, filters, editors or maps",()=>{
 for(const path of["lib/directory-store.ts","lib/directory-query.ts","lib/map-query.ts","lib/notion-directory-sync.ts","components/admin-directory-editor.tsx","components/directory-page.tsx","lib/gemini-notion-directory-review.ts"]){
  assert.ok(!readFileSync(path,"utf8").includes("service-catalog-contract"),path);
 }
});
