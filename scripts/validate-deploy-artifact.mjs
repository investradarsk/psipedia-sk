import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`${label} is missing: ${path.relative(defaultRoot, filePath) || filePath}`);
  }
}

async function assertDirectory(directoryPath, label) {
  const stat = await fs.stat(directoryPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`${label} is missing: ${path.relative(defaultRoot, directoryPath) || directoryPath}`);
  }
}

async function walkFiles(directoryPath, prefix = "") {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push({ relativePath, absolutePath });
    }
  }
  return files;
}

export async function fingerprintDirectory(directoryPath) {
  const files = await walkFiles(directoryPath);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(await fs.readFile(file.absolutePath));
    hash.update("\0");
  }
  return { fingerprint: hash.digest("hex"), fileCount: files.length };
}

export async function validatePreparedDeployArtifact({
  root = defaultRoot,
  canonicalResources = null,
} = {}) {
  const distDirectory = path.join(root, "dist");
  const serverDirectory = path.join(distDirectory, "server");
  const generatedWranglerPath = path.join(serverDirectory, "wrangler.json");
  const hostingManifestPath = path.join(distDirectory, ".openai", "hosting.json");
  const resourceConfigPath = path.join(root, "config", "cloudflare-resources.json");

  await assertDirectory(distDirectory, "Prepared deploy dist directory");
  await assertDirectory(serverDirectory, "Prepared Worker directory");
  await assertFile(generatedWranglerPath, "Generated Wrangler config");
  await assertFile(hostingManifestPath, "Packaged hosting manifest");

  const [wrangler, resources] = await Promise.all([
    readJson(generatedWranglerPath),
    canonicalResources ? Promise.resolve(canonicalResources) : readJson(resourceConfigPath),
  ]);

  if (typeof wrangler.main !== "string" || !wrangler.main.trim()) {
    throw new Error("dist/server/wrangler.json must declare the prepared Worker entry in main");
  }
  if (wrangler.build?.command) {
    throw new Error("dist/server/wrangler.json must not declare build.command; deploy must use the already prepared artifact");
  }

  const workerEntry = path.resolve(serverDirectory, wrangler.main);
  await assertFile(workerEntry, "Prepared Worker entry");

  if (wrangler.assets?.directory) {
    await assertDirectory(
      path.resolve(serverDirectory, wrangler.assets.directory),
      "Prepared assets directory",
    );
  }

  const expectedD1Binding = resources.d1?.binding;
  const expectedR2Binding = resources.r2?.binding;
  if (!expectedD1Binding || !expectedR2Binding) {
    throw new Error("Canonical Cloudflare resource config must declare D1 and R2 bindings");
  }

  const d1Bindings = Array.isArray(wrangler.d1_databases)
    ? wrangler.d1_databases.map((entry) => entry?.binding).filter(Boolean)
    : [];
  const r2Bindings = Array.isArray(wrangler.r2_buckets)
    ? wrangler.r2_buckets.map((entry) => entry?.binding).filter(Boolean)
    : [];

  if (!d1Bindings.includes(expectedD1Binding)) {
    throw new Error(`Generated Wrangler config is missing canonical D1 binding ${expectedD1Binding}`);
  }
  if (!r2Bindings.includes(expectedR2Binding)) {
    throw new Error(`Generated Wrangler config is missing canonical R2 binding ${expectedR2Binding}`);
  }

  const identity = await fingerprintDirectory(distDirectory);
  return Object.freeze({
    ...identity,
    workerEntry: path.relative(root, workerEntry),
    generatedWranglerPath: path.relative(root, generatedWranglerPath),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validatePreparedDeployArtifact();
  console.log(
    `[deploy-artifact] PASS — ${result.generatedWranglerPath}; files=${result.fileCount}; sha256=${result.fingerprint}`,
  );
}
