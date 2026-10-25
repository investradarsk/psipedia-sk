#!/usr/bin/env node
/**
 * ADMIN-DUP-01 read-only inventory of UI primitives used by admin components
 * and routes. Indicators are candidates for manual review, not lint violations.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ADMIN_DUP_SIGNALS = Object.freeze({
  nativeConfirm: /\bwindow\.confirm\s*\(/g,
  rawActionButton: /<button\b/g,
  sharedActionButton: /<AdminActionButton\b/g,
  nativeFileInput: /<input\b[^>]*\btype\s*=\s*["']file["']/g,
  sharedSingleImage: /<AdminSingleImageUpload\b/g,
  sharedGallery: /<(?:AdminPhotoGallery|AdminGalleryDropzone|AdminSortableGallery)\b/g,
  nativeTable: /<table\b/g,
  nativeSelect: /<select\b/g,
  sharedPagination: /<AdminPagination\b/g,
  localPagination: /<nav\b[^>]*\baria-label=["'][^"']*[Ss]tránkovan/g,
  sharedModal: /<(?:AdminModalDialog|AdminDestructiveConfirmDialog|AdminUnsavedNavigationDialog)\b/g,
  sharedFeedback: /<AdminFormFeedback\b/g,
  sharedUnsavedGuard: /<EditorUnsavedChangesGuard\b/g,
  sharedWorkspace: /<EditorWorkspace\b/g,
});

export function scanAdminUiSource(path, source) {
  const signals = {};
  for (const [key, pattern] of Object.entries(ADMIN_DUP_SIGNALS)) {
    const occurrences = [...source.matchAll(pattern)];
    if (!occurrences.length) continue;
    signals[key] = {
      count: occurrences.length,
      lines: occurrences.map(match => source.slice(0, match.index).split("\n").length),
    };
  }
  return { path, signals };
}

async function listTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await listTsxFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}

export async function collectAdminUiDuplicationInventory(
  root = resolve(fileURLToPath(new URL("../", import.meta.url))),
) {
  const components = (await listTsxFiles(join(root, "components")))
    .filter(path => /^admin-.*\.tsx$/.test(path.split(/[\\/]/).at(-1)));
  const pages = await listTsxFiles(join(root, "app", "admin"));
  const paths = [...components, ...pages].sort();
  const scanned = await Promise.all(paths.map(async path => {
    const source = await readFile(path, "utf8");
    return scanAdminUiSource(relative(root, path).replaceAll("\\", "/"), source);
  }));
  const totals = {};
  const affectedFiles = {};
  for (const row of scanned) for (const [key, value] of Object.entries(row.signals)) {
    totals[key] = (totals[key] ?? 0) + value.count;
    affectedFiles[key] = (affectedFiles[key] ?? 0) + 1;
  }
  return {
    scannedAt: "runtime",
    scope: { adminComponents: components.length, adminRoutes: pages.length, totalFiles: paths.length },
    occurrences: Object.fromEntries(Object.entries(totals).sort()),
    filesWithSignal: Object.fromEntries(Object.entries(affectedFiles).sort()),
    files: scanned.filter(row => Object.keys(row.signals).length),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await collectAdminUiDuplicationInventory();
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("ADMIN-DUP-01 (read-only) — source indicators, not confirmed duplication");
    console.log(JSON.stringify({ scope: report.scope, occurrences: report.occurrences, filesWithSignal: report.filesWithSignal }, null, 2));
    console.log("Use --json to list exact files and line numbers; compare #1040 before implementing.");
  }
}
