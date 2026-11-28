import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {decimalInput,dogEnergy,foodPortion,foodCosts,annualDogBudget} from "../lib/dog-calculators.ts";
test("energy uses RER and life-stage factors, rejects invalid weight",()=>{
 const e=dogEnergy(16,"adultNeutered");assert.equal(e.rer,560);assert.equal(e.daily,896);
 assert.equal(dogEnergy(16,"puppyYoung").daily,1680);assert.equal(dogEnergy(0,"adultNeutered"),null);
 assert.equal(dogEnergy(20,"unknown"),null);assert.equal(dogEnergy(NaN,"adultIntact"),null);
});
test("portion uses kcal per kg and excludes other calories",()=>{
 assert.equal(foodPortion(1000,4000,200),200);assert.equal(foodPortion(1000,4000),250);
 assert.equal(foodPortion(1000,0),null);assert.equal(foodPortion(1000,4000,1000),null);
});
test("food costs and annual budget use actual grams and 30/365 day periods",()=>{
 const c=foodCosts(12,60,300);assert.equal(c.days,40);assert.equal(c.daily,1.5);assert.equal(c.monthly,45);assert.equal(c.yearly,547.5);assert.equal(c.perKg,5);
 assert.equal(foodCosts(0,60,300),null);assert.equal(foodCosts(12,60,0),null);assert.equal(foodCosts(12,0,300).daily,0);
 assert.deepEqual(annualDogBudget(70,250,200),{annual:1090,firstYear:1290});
});
test("decimal inputs support Slovak comma and reject nonnumeric/infinite values",()=>{
 assert.equal(decimalInput("12,5",0,100),12.5);for(const v of ["","NaN","Infinity","1e2","-1","1,2,3"])assert.equal(decimalInput(v,0,100),null);
});
test("public route, source citations, no network, existing affiliate destinations",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 assert.match(read("lib/portal.ts"),/slug: "kalkulacky"/);
 assert.match(read("app/[section]/[slug]/page.tsx"),/<DogCalculatorsPage/);
 assert.match(read("components/dog-calculators.tsx"),/DOG_ENERGY_SOURCE/);
 assert.doesNotMatch(read("components/dog-calculators.tsx"),/fetch\(/);
 assert.match(read("components/dog-calculators-page.tsx"),/rel="sponsored noopener noreferrer"/);
});
