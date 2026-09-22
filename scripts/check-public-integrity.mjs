import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanRoots = ["app", "components"];
const additionalFiles = ["lib/help.ts", "lib/portal.ts"];

const forbidden = [
  "Každý modul používa vlastné canonical dáta",
  "bez náhradných alebo vymyslených služieb",
  "Nové články sa sem budú pripájať cez redakčnú administráciu",
  "Pôvodná kategória zachovaná pre existujúce",
  "Publikované články sa na tejto adrese zobrazia automaticky po redakčnom schválení",
];

function shouldSkip(relativePath) {
  return relativePath.startsWith("app/admin/")
    || relativePath.startsWith("app/api/")
    || relativePath.includes("/__tests__/");
}

async function collectFiles(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkip(relative + "/")) files.push(...await collectFiles(absolute, relative));
      continue;
    }
    if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name) && !shouldSkip(relative)) files.push(relative);
  }
  return files;
}

const files = [];
for (const scanRoot of scanRoots) {
  files.push(...await collectFiles(path.join(root, scanRoot), scanRoot));
}
files.push(...additionalFiles);

const failures = [];
for (const relative of [...new Set(files)].sort()) {
  const source = await readFile(path.join(root, relative), "utf8");
  for (const phrase of forbidden) {
    if (source.includes(phrase)) failures.push(relative + ": forbidden public implementation copy: " + phrase);
  }
}

if (failures.length) {
  console.error("Public integrity audit failed:\n" + failures.map((item) => "- " + item).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Public integrity audit passed.");
}
