import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {breedSectionForView,publicFciSectionName} from "../lib/breed-fci.ts";

const notion="Pastierske a dobytkárske psy (okrem švajčiarskych) – dobytkárske psy";

test("editor and one-shot readback return actual stored FCI section",()=>{
  assert.equal(breedSectionForView(1,"2",notion),notion);
  assert.equal(breedSectionForView(1,"2",notion,false),notion);
});
test("public FCI section keeps the correct canonical label",()=>{
  const canonical="Pastierske psy okrem švajčiarskych salašníckych psov";
  assert.equal(publicFciSectionName(1,"2",notion),canonical);
  assert.equal(breedSectionForView(1,"2",notion,true),canonical);
});
test("unknown FCI category keeps existing public fallback",()=>{
  assert.equal(breedSectionForView(3,"99","Original"),"Original");
  assert.equal(breedSectionForView(3,"99","Original",true),"Sekcia sa overuje");
});
test("breed store uses raw section in internal reads, public label in public views",()=>{
  const source=readFileSync(new URL("../lib/breed-store.ts",import.meta.url),"utf8");
  assert.match(
    source,
    /fciSection:\s*breedSectionForView\(row\.fci_group,\s*row\.fci_section_number,\s*row\.fci_section,\s*relations\.public\)/,
  );
  assert.match(
    source,
    /fciSection:\s*publicFciSectionName\(row\.fci_group,\s*row\.fci_section_number,\s*row\.fci_section\)/,
  );
});
