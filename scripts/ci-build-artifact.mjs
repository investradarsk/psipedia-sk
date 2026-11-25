import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePreparedDeployArtifact } from "./validate-deploy-artifact.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const metadata = "ci-v2-build-identity.json";
const registry = "lib/generated/component-registry.json";

export function assertBuildProfile(profile, env) {
  if (profile !== "standard" && profile !== "local-e2e") {
    throw new Error("Unknown build profile: " + profile);
  }
  const local = env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP === "1";
  if (local !== (profile === "local-e2e")) {
    throw new Error("Build profile does not match local bootstrap environment");
  }
  if (local && env.E2E_BASE_URL !== "http://localhost:5173") {
    throw new Error("Unexpected local E2E base URL");
  }
  if (env.MAP_UI_TEST_RENDERER) {
    throw new Error("Shared review build does not permit a custom map renderer");
  }
}

export function assertArtifactIdentity(expected, actual) {
  for (const field of [
    "version", "profile", "revision", "node", "lockSha256",
    "registrySha256", "distSha256", "fileCount",
  ]) {
    if (expected[field] === undefined || expected[field] !== actual[field]) {
      throw new Error("Shared build identity mismatch: " + field);
    }
  }
}

async function digest(path) {
  return createHash("sha256").update(await readFile(resolve(root, path))).digest("hex");
}

async function currentIdentity(profile) {
  assertBuildProfile(profile, process.env);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (!process.env.GITHUB_SHA || revision !== process.env.GITHUB_SHA) {
    throw new Error("Shared build must use the exact GitHub workflow revision");
  }
  const artifact = await validatePreparedDeployArtifact({ root });
  return {
    version: 1,
    profile,
    revision,
    node: process.version,
    lockSha256: await digest("package-lock.json"),
    registrySha256: await digest(registry),
    distSha256: artifact.fingerprint,
    fileCount: artifact.fileCount,
  };
}

async function main() {
  const [mode, profile, ...extra] = process.argv.slice(2);
  if (extra.length || !["record", "verify"].includes(mode)) {
    throw new Error("Usage: ci-build-artifact.mjs record|verify standard|local-e2e");
  }
  const current = await currentIdentity(profile);
  const path = resolve(root, metadata);
  if (mode === "record") {
    await writeFile(path, JSON.stringify(current, null, 2) + "\n");
  } else {
    const expected = JSON.parse(await readFile(path, "utf8"));
    assertArtifactIdentity(expected, current);
  }
  console.log("[ci-build] " + mode + " " + profile + " " + current.revision + " " + current.distSha256);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
