import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readDirectoryPublicMetadataSource,
  readDirectoryPublicMetadataValue,
} from "../lib/directory-public-facts.ts";

test("partner profile and Admin/public read identical canonical-first hours", () => {
  const partner = readFileSync(new URL("../lib/partner-profile-changes.ts", import.meta.url), "utf8");
  assert.match(partner, /readDirectoryPublicMetadataValue\(sourceData, "Ordinačné hodiny"\)/);
  assert.match(partner, /for \(const key of OPENING_HOUR_KEYS\) delete source\[key\]/);
  assert.match(partner, /source\["Ordinačné hodiny"\] = String\(patch\.openingHours \?\? ""\)\.trim\(\)/);
  assert.doesNotMatch(partner, /source\["Otváracie hodiny"\] =/);

  const legacy = {
    "Otváracie hodiny": "Po-Pi 9:00-17:00",
    "Kvalifikácie": "Ostatné historické hodnoty",
    "_psipedia_additional_categories": ["treneri"],
  };
  assert.deepEqual(readDirectoryPublicMetadataSource(legacy, "Ordinačné hodiny"),
    { sourceKey: "Otváracie hodiny", value: "Po-Pi 9:00-17:00" });
  const cleared = { ...legacy, "Ordinačné hodiny": "" };
  assert.equal(readDirectoryPublicMetadataValue(cleared, "Ordinačné hodiny"), "");
  assert.equal(cleared["Kvalifikácie"], legacy["Kvalifikácie"]);
  assert.deepEqual(cleared["_psipedia_additional_categories"],
    legacy["_psipedia_additional_categories"]);
  const newHours = { ...legacy, "Ordinačné hodiny": "Ut-Pia 10:00-18:00" };
  assert.equal(readDirectoryPublicMetadataValue(newHours, "Ordinačné hodiny"),
    "Ut-Pia 10:00-18:00");
});
