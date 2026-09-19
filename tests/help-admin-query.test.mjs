import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { HELP_ADMIN_PAGE_SIZE, foldHelpAdminText, parseHelpAdminFilters, queryHelpAdmin } from "../lib/help-admin-query.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE help_cases (
    id INTEGER PRIMARY KEY, slug TEXT, title TEXT, category TEXT, status TEXT, organization TEXT, dog_name TEXT,
    city TEXT, region TEXT, location_note TEXT, image_url TEXT, verified INTEGER, urgent INTEGER, resolved INTEGER, updated_at TEXT
  )`);
  const insert = sqlite.prepare("INSERT INTO help_cases VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?)");
  for (let i = 1; i <= 121; i++) {
    insert.run(
      i,
      `generic-${i}`,
      i === 121 ? "Žltý pes potrebuje pomoc" : i === 119 ? "Pomoc na 100% pre psov" : `Generic výzva ${i}`,
      "dobrovolnictvo",
      i <= 65 ? "draft" : "published",
      i === 121 ? "OZ Žltá Labka" : "OZ Pomoc",
      i === 121 ? "Žofka" : "",
      i === 121 ? "Žilina" : "Trnava",
      i === 121 ? "Žilinský kraj" : "Trnavský kraj",
      i === 121 ? "Čadca a okolie" : "",
      i === 121 ? 1 : 0,
      i === 120 ? 1 : 0,
      String(i).padStart(3, "0"),
    );
  }
  insert.run(122, "docasna", "Dočasná opatera", "docasna-opatera", "draft", "OZ Pomoc", "Max", "Nitra", "Nitriansky kraj", "", 0, 0, "122");
  insert.run(123, "zbierka", "Overená zbierka", "zbierky", "published", "OZ Pomoc", "", "Nitra", "Nitriansky kraj", "", 0, 0, "123");
  insert.run(124, "legacy-urgent", "Legacy urgent", "urgentne-pripady", "draft", "OZ Pomoc", "", "Nitra", "Nitriansky kraj", "", 1, 0, "124");
  insert.run(201, "legacy-adopcia", "Legacy adopcia", "adopcia", "draft", "OZ Dedicated", "Rex", "Nitra", "Nitriansky kraj", "", 1, 0, "201");
  insert.run(202, "legacy-utulok", "Legacy útulok", "utulky", "published", "OZ Dedicated", "", "Nitra", "Nitriansky kraj", "", 0, 0, "202");
  insert.run(203, "legacy-lost", "Legacy stratený pes", "stratene-a-najdene", "published", "OZ Dedicated", "Beny", "Nitra", "Nitriansky kraj", "", 1, 0, "203");
  sqlite.exec("CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO lost_found_dog_reports VALUES (1, 'Nezávislý prípad')");
  const sql=[];
  const db={prepare(query){sql.push(query);return{bind(...args){this.args=args;return this;},async first(){return sqlite.prepare(query).get(...(this.args??[]));},async all(){return{results:sqlite.prepare(query).all(...(this.args??[]))};}};}};
  return {sqlite,db,sql};
}
const filters=(overrides={})=>({category:"all",status:"all",urgent:"all",state:"all",organization:"",location:"",q:"",page:1,...overrides});

test("full counts cover only generic Help and list stays paged at 50", async () => {
  const {db,sqlite,sql}=fixture();
  const result=await queryHelpAdmin(db,filters());
  assert.deepEqual({...result.totals},{total:124,published:57,draft:67,urgent:2,current:123,resolved:1});
  assert.equal(result.items.length,HELP_ADMIN_PAGE_SIZE);
  assert.equal(result.pages,3);
  assert.equal(result.categoryCounts.dobrovolnictvo,121);
  assert.equal(result.categoryCounts["docasna-opatera"],1);
  assert.equal(result.categoryCounts.zbierky,1);
  assert.equal(result.categoryCounts["urgentne-pripady"],1);
  for (const dedicated of ["adopcia","utulky","stratene-a-najdene"]) assert.equal(result.categoryCounts[dedicated],undefined);
  assert.ok(sql.every((query)=>/^SELECT\b/.test(query)));
  assert.ok(sql.every((query)=>!query.includes("lost_found_dog_reports")));
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM lost_found_dog_reports").get().count,1);
});

test("category, publication, urgent and resolved/current filters combine on the complete dataset", async () => {
  const {db}=fixture();
  assert.equal((await queryHelpAdmin(db,filters({category:"dobrovolnictvo"}))).resultCount,121);
  assert.equal((await queryHelpAdmin(db,filters({status:"draft"}))).resultCount,67);
  assert.equal((await queryHelpAdmin(db,filters({urgent:"urgent"}))).resultCount,2);
  assert.equal((await queryHelpAdmin(db,filters({state:"resolved"}))).resultCount,1);
  assert.equal((await queryHelpAdmin(db,filters({state:"current",status:"published"}))).resultCount,56);
  assert.equal((await queryHelpAdmin(db,filters({category:"adopcia"}))).resultCount,0);
  assert.equal((await queryHelpAdmin(db,filters({category:"stratene-a-najdene"}))).resultCount,0);
});

test("accent-insensitive search plus organization and location filters are literal and composable", async () => {
  const {db}=fixture();
  for (const q of ["zlty","ZO FKA","OZ zlta labka","zilina"]) {
    assert.equal((await queryHelpAdmin(db,filters({q}))).resultCount,1,q);
  }
  assert.equal((await queryHelpAdmin(db,filters({q:"%"}))).resultCount,1);
  assert.equal((await queryHelpAdmin(db,filters({organization:"zlta labka"}))).resultCount,1);
  assert.equal((await queryHelpAdmin(db,filters({location:"cadca"}))).resultCount,1);
  assert.equal((await queryHelpAdmin(db,filters({location:"zilinsky"}))).resultCount,1);
  assert.equal((await queryHelpAdmin(db,filters({organization:"zlta",location:"zilina",urgent:"urgent"}))).resultCount,1);
  assert.equal(foldHelpAdminText("Žltá Ľalia"),"zlta lalia");
});

test("pagination clamps safely and dedicated URL categories cannot become Help filters", async () => {
  const {db}=fixture();
  assert.equal((await queryHelpAdmin(db,filters({page:2}))).items.length,50);
  assert.equal((await queryHelpAdmin(db,filters({page:900}))).page,3);
  assert.deepEqual(
    parseHelpAdminFilters(new URLSearchParams("category=dobrovolnictvo&status=draft&urgent=urgent&state=current&organization=OZ+Žltá&location=Žilina&q=pes&page=2")),
    filters({category:"dobrovolnictvo",status:"draft",urgent:"urgent",state:"current",organization:"OZ Žltá",location:"Žilina",q:"pes",page:2}),
  );
  for (const category of ["adopcia","utulky","stratene-a-najdene"]) {
    assert.equal(parseHelpAdminFilters(new URLSearchParams(`category=${category}`)).category,"all");
  }
  assert.deepEqual(parseHelpAdminFilters(new URLSearchParams("status=bogus&urgent=no&state=bogus&page=-4")),filters());
});
