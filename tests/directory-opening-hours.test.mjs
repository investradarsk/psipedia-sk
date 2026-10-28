import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/directory-opening-hours.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", js)(exports);
const { parseDirectoryOpeningHours } = exports;

test("formats only explicitly supplied weekday hours in Monday-first order", () => {
  assert.deepEqual(parseDirectoryOpeningHours("Sobota: zatvorené\nPo: 08:00–16:00\nUt 09:00-18:00"), [
    { day: "Pondelok", hours: "08:00–16:00" },
    { day: "Utorok", hours: "09:00-18:00" },
    { day: "Sobota", hours: "zatvorené" },
  ]);
  assert.deepEqual(parseDirectoryOpeningHours("Št: na objednávku; Pi: 08:00 - 12:00"), [
    { day: "Štvrtok", hours: "na objednávku" },
    { day: "Piatok", hours: "08:00 - 12:00" },
  ]);
});

test("preserves ambiguous free text and ranges as raw source, not inferred weekdays", () => {
  for (const value of [
    "Po–Pi 08:00–16:00",
    "Po - Pi: 08:00–16:00",
    "Každý deň podľa dohody",
    "Po: 08:00\nPo: 10:00",
    "Príjem pacientov v ambulancii podľa objednávky",
    "",
  ]) {
    assert.equal(parseDirectoryOpeningHours(value), null, value);
  }
});

test("missing weekdays are not manufactured as closed or open", () => {
  assert.deepEqual(parseDirectoryOpeningHours("Pi: 08:00-13:00"), [
    { day: "Piatok", hours: "08:00-13:00" },
  ]);
});
