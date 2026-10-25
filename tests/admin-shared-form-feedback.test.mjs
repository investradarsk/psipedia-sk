import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../"+path, import.meta.url), "utf8");

test("shared save feedback prioritizes errors and has accessible live statuses", () => {
  const src = read("components/admin-form-feedback.tsx");
  assert.match(src, /export function AdminFormFeedback/);
  assert.match(src, /const state = error \? "error" : pending \? "saving" : message \? "success" : null/);
  assert.match(src, /if \(!state\) return null/);
  assert.match(src, /role=\{state === "error" \? "alert" : "status"\}/);
  assert.match(src, /aria-live=\{state === "error" \? "assertive" : "polite"\}/);
  assert.match(src, /aria-atomic="true"/);
  assert.match(src, /data-admin-form-feedback=\{state\}/);
  assert.match(src, /state === "saving" \? pendingLabel : message/);
  const css = read("components/admin-form-feedback.module.css");
  for (const name of [".feedback", ".error", ".info"]) assert.ok(css.includes(name));
});

test("Adoptions and Lost/Found reuse shared save feedback without changing mutation contracts", () => {
  const adoption = read("components/admin-adoption-editor.tsx");
  const lost = read("components/admin-lost-found-editor.tsx");
  for (const src of [adoption, lost]) {
    assert.match(src, /<AdminFormFeedback message=\{message\} error=\{error\} pending=\{saving\}/);
    assert.match(src, /setSaving\(true\)/);
    assert.match(src, /setSaving\(false\)/);
    assert.match(src, /setError\(/);
  }
  assert.match(adoption, /expectedUpdatedAt: version/);
  assert.match(adoption, /\/api\/admin\/adoptions/);
  assert.match(lost, /markDuplicate\(/);
  assert.match(lost, /<AdminPhotoGallery/);
});

test("Help and Breeds share save feedback without changing persistence",()=>{
  const help=read("components/admin-help-editor.tsx");
  const breeds=read("components/admin-breed-editor.tsx");
  for(const src of [help,breeds]){
    assert.match(src,/<AdminFormFeedback message=\{message\} error=\{error\} pending=\{saving\}/);
    assert.match(src,/setSaving\(true\)/);
  }
  assert.match(help,/\/api\/admin\/help/);
  assert.match(breeds,/expectedUpdatedAt/);
  assert.match(breeds,/inspectBreedMeasurement\(value,kind\)/);
});

test("Breed measurement errors are linked to their inputs",()=>{
  const src=read("components/admin-breed-editor.tsx");
  const shared=read("components/admin-form-feedback.tsx");
  assert.match(shared,/export function AdminFieldFeedback/);
  assert.match(shared,/role=\{invalid\?"alert":undefined\}/);
  for(const [field,id] of [["weight","breed-weight-feedback"],["height","breed-height-feedback"],["lifespan","breed-lifespan-feedback"]]){
    assert.ok(src.includes('aria-describedby={measurementMessage(form.'+field+',"'+field+'") ? "'+id+'" : undefined}'));
    assert.ok(src.includes('<AdminFieldFeedback id="'+id+'" message={measurementMessage(form.'+field+',"'+field+'")} invalid={measurementHasError(form.'+field+',"'+field+'")}'));
  }
});
