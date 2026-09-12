import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read=(p)=>readFile(new URL(`../${p}`,import.meta.url),'utf8');
test('adoption migration contains lifecycle, safe breed FK and scalable indexes',async()=>{const sql=await read('drizzle/0029_adoption_dogs.sql');for(const status of ['DRAFT','ACTIVE','RESERVED','ADOPTED','ARCHIVED'])assert.match(sql,new RegExp(status));assert.match(sql,/FOREIGN KEY \(`breed_id`\) REFERENCES `managed_breeds`/);assert.doesNotMatch(sql,/FOREIGN KEY \(`organization_id`\)/);assert.match(sql,/adoption_dogs_public_idx/);assert.match(sql,/adoption_dogs_verification_idx/);});
test('public adoption route and stale-profile policy stay explicit',async()=>{const [model,list,detail]=await Promise.all([read('lib/adoption.ts'),read('app/pomoc-psom/adopcia/page.tsx'),read('app/pomoc-psom/adopcia/[slug]/page.tsx')]);assert.match(model,/ADOPTION_STALE_AFTER_DAYS = 30/);assert.match(list,/listPublicAdoptions/);assert.match(detail,/dog\.status==='ACTIVE'/);assert.match(detail,/robots:\{index,follow:true\}/);});
