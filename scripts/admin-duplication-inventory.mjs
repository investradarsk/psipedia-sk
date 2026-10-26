#!/usr/bin/env node
// Read-only lexical inventory. Results are candidates for manual inspection.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PATTERNS = [
  ["nativeConfirm", /\bwindow\.confirm\s*\(/g],
  ["nativeAlert", /\bwindow\.alert\s*\(/g],
  ["sharedConfirm", /<AdminDestructiveConfirmDialog\b/g],
  ["sharedModal", /<AdminModalDialog\b/g],
  ["rawButton", /<button(?:\s|>)/g],
  ["sharedButton", /<AdminActionButton\b/g],
  ["rawSelect", /<select(?:\s|>)/g],
  ["rawTable", /<table(?:\s|>)/g],
  ["sharedPagination", /<AdminPagination\b/g],
  ["sharedBulk", /<AdminBulkSelection\b/g],
  ["singleImage", /<AdminSingleImageUpload\b/g],
  ["gallery", /<AdminPhotoGallery\b/g],
  ["nativeFileInput", /<input\b[^>]*\btype\s*=\s*["']file["']/g],
  ["feedback", /<AdminFormFeedback\b/g],
  ["unsavedGuard", /<EditorUnsavedChangesGuard\b|<AdminUnsavedNavigationDialog\b/g],
  ["workspace", /<EditorWorkspace\b/g],
  ["actionBar", /<EditorActionBar\b/g],
];

function walk(dir) {
  const paths = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) paths.push(...walk(path));
      else if (entry.isFile() && path.endsWith(".tsx")) paths.push(path);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return paths;
}

export function scanSource(path, text) {
  const matches = [];
  for (const [name, regex] of PATTERNS) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const line = text.slice(0, match.index).split("\n").length;
      matches.push({ pattern: name, line });
    }
  }
  return { path, matches: matches.sort((a,b) => a.line-b.line || a.pattern.localeCompare(b.pattern)) };
}

export function inventory(root = process.cwd()) {
  const files = [
    ...walk(join(root,"components")).filter(path => /^admin-.*\.tsx$/.test(path.split(sep).at(-1))),
    ...walk(join(root,"app","admin")),
  ].sort();
  const results = files.map(path => scanSource(
    relative(root,path).split(sep).join("/"),
    readFileSync(path,"utf8")
  ));
  const summary = PATTERNS.map(([name]) => {
    const matched = results.filter(item => item.matches.some(hit => hit.pattern === name));
    return {
      pattern: name, files: matched.length,
      occurrences: matched.reduce((n,item) => n+item.matches.filter(hit => hit.pattern === name).length,0),
      paths: matched.map(item => item.path),
    };
  });
  return { scannedFiles: files.length, summary, results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inventory();
  if (process.argv.includes("--json")) console.log(JSON.stringify(result,null,2));
  else {
    console.log("PSIPEDIA admin — read-only duplication candidates; verify semantics manually");
    console.log("Scanned .tsx files: "+result.scannedFiles);
    for (const item of result.summary) {
      console.log(item.pattern+": "+item.occurrences+" occurrences / "+item.files+" files");
      if (item.paths.length) console.log("  "+item.paths.slice(0,15).join(", "));
    }
  }
}
