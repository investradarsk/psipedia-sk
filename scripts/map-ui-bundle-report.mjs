import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/client");
const needles = [
  "maps.googleapis.com/maps/api/js",
  "__PSIPEDIA_MAP_INIT_COUNT__",
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const files = walk(root).filter((file) => file.endsWith(".js"));
const matches = [];
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  if (!needles.some((needle) => content.includes(needle))) continue;
  matches.push({
    file: path.relative(root, file),
    bytes: fs.statSync(file).size,
    needles: needles.filter((needle) => content.includes(needle)),
  });
}

const total = matches.reduce((sum, match) => sum + match.bytes, 0);
console.log(`MAP_UI_BUNDLE matching_chunks=${matches.length} total_bytes=${total}`);
for (const match of matches) {
  console.log(`MAP_UI_BUNDLE chunk=${match.file} bytes=${match.bytes} evidence=${match.needles.join(",")}`);
}

if (!matches.length) {
  console.log("MAP_UI_BUNDLE note=no literal renderer chunk located; inspect build manifest manually");
}
