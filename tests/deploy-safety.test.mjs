import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEPLOYMENT_STEPS,
  runSafeCloudflareDeployment,
} from "../scripts/deploy-cloudflare-safe.mjs";
import { validatePreparedDeployArtifact } from "../scripts/validate-deploy-artifact.mjs";

function createHarness({ failCommand = null, failValidationPhase = null, fingerprints = ["artifact-a", "artifact-a"] } = {}) {
  const events = [];
  let validationIndex = 0;

  return {
    events,
    runCommand: async (step) => {
      events.push(step.id);
      if (step.id === failCommand) throw new Error(`forced ${step.id} failure`);
    },
    validateArtifact: async ({ phase }) => {
      const event = phase === "before-remote" ? "prepared-artifact-validation" : "artifact-identity-recheck";
      events.push(event);
      if (phase === failValidationPhase) throw new Error(`forced ${phase} validation failure`);
      const fingerprint = fingerprints[Math.min(validationIndex, fingerprints.length - 1)];
      validationIndex += 1;
      return { fingerprint, fileCount: 3 };
    },
  };
}

test("happy path is build -> artifact validation -> read-only remote audit -> same-artifact check -> deploy", async () => {
  const harness = createHarness();
  await runSafeCloudflareDeployment(harness);
  assert.deepEqual(harness.events, [
    "config-check",
    "build",
    "artifact-validation",
    "prepared-artifact-validation",
    "remote-migration",
    "remote-audit",
    "artifact-identity-recheck",
    "deploy",
  ]);
});

test("build failure performs no remote mutation and no deploy", async () => {
  const harness = createHarness({ failCommand: "build" });
  await assert.rejects(() => runSafeCloudflareDeployment(harness), /forced build failure/);
  assert.equal(harness.events.includes("remote-migration"), false);
  assert.equal(harness.events.includes("deploy"), false);
});

test("Workers Builds deploys the prepared artifact without remote D1 mutation", async () => {
  const harness = createHarness({ failCommand: "build" });
  const result = await runSafeCloudflareDeployment({
    ...harness,
    env: {
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "main",
      WORKERS_CI_COMMIT_SHA: "commit-a",
    },
  });
  assert.deepEqual(harness.events, ["deploy"]);
  assert.equal(result.fingerprint, "commit-a");
  assert.equal(harness.events.includes("config-check"), false);
  assert.equal(harness.events.includes("build"), false);
  assert.equal(harness.events.includes("artifact-validation"), false);
  assert.equal(harness.events.includes("remote-migration"), false);
  assert.equal(harness.events.includes("remote-audit"), false);
});

test("Workers Builds preview branches also remain read-only against remote D1", async () => {
  const harness = createHarness({ failCommand: "build" });
  const result = await runSafeCloudflareDeployment({
    ...harness,
    env: {
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "codex/example-preview",
      WORKERS_CI_COMMIT_SHA: "commit-preview",
    },
  });
  assert.deepEqual(harness.events, ["deploy"]);
  assert.equal(result.fingerprint, "commit-preview");
  assert.equal(harness.events.includes("remote-migration"), false);
  assert.equal(harness.events.includes("remote-audit"), false);
});

test("artifact validation failure performs no remote mutation and no deploy", async () => {
  const harness = createHarness({ failValidationPhase: "before-remote" });
  await assert.rejects(() => runSafeCloudflareDeployment(harness), /forced before-remote validation failure/);
  assert.equal(harness.events.includes("remote-migration"), false);
  assert.equal(harness.events.includes("deploy"), false);
});

test("remote migration failure blocks audit and deploy", async () => {
  const harness = createHarness({ failCommand: "remote-migration" });
  await assert.rejects(() => runSafeCloudflareDeployment(harness), /forced remote-migration failure/);
  assert.equal(harness.events.includes("remote-audit"), false);
  assert.equal(harness.events.includes("deploy"), false);
});

test("remote audit failure blocks deploy", async () => {
  const harness = createHarness({ failCommand: "remote-audit" });
  await assert.rejects(() => runSafeCloudflareDeployment(harness), /forced remote-audit failure/);
  assert.equal(harness.events.includes("deploy"), false);
});

test("same-artifact contract blocks deploy when dist changes after remote mutation", async () => {
  const harness = createHarness({ fingerprints: ["artifact-a", "artifact-b"] });
  await assert.rejects(() => runSafeCloudflareDeployment(harness), /prepared artifact changed after validation/);
  assert.equal(harness.events.includes("deploy"), false);
});

test("orchestration is fully injectable so tests execute no production commands", async () => {
  const harness = createHarness();
  await runSafeCloudflareDeployment(harness);
  assert.equal(harness.events.filter((event) => event === "remote-migration").length, 1);
  assert.equal(harness.events.filter((event) => event === "deploy").length, 1);
  assert.ok(DEPLOYMENT_STEPS.remoteAudit.args.includes("--remote"));
  assert.ok(DEPLOYMENT_STEPS.remoteAudit.args.includes("--strict"));
  assert.deepEqual(DEPLOYMENT_STEPS.deploy.args.slice(0, 3), ["deploy", "--config", "dist/server/wrangler.json"]);
  assert.ok(DEPLOYMENT_STEPS.deploy.args.includes("--no-bundle"), "production deploy must not create a new Wrangler bundle after DB mutation");
});

async function createArtifactFixture({ buildCommand = null } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "psipedia-deploy-artifact-"));
  await fs.mkdir(path.join(root, "dist", "server"), { recursive: true });
  await fs.mkdir(path.join(root, "dist", "client"), { recursive: true });
  await fs.mkdir(path.join(root, "dist", ".openai"), { recursive: true });
  await fs.writeFile(path.join(root, "dist", "server", "index.js"), "export default { fetch() {} };\n");
  await fs.writeFile(path.join(root, "dist", "client", "asset.txt"), "asset-a\n");
  await fs.writeFile(path.join(root, "dist", ".openai", "hosting.json"), "{}\n");

  const wrangler = {
    main: "./index.js",
    assets: { directory: "../client" },
    d1_databases: [{ binding: "DB" }],
    r2_buckets: [{ binding: "BUCKET" }],
    ...(buildCommand ? { build: { command: buildCommand } } : {}),
  };
  await fs.writeFile(
    path.join(root, "dist", "server", "wrangler.json"),
    `${JSON.stringify(wrangler, null, 2)}\n`,
  );
  return root;
}

test("prepared artifact validator fingerprints the complete dist tree deterministically", async (t) => {
  const root = await createArtifactFixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const options = {
    root,
    canonicalResources: { d1: { binding: "DB" }, r2: { binding: "BUCKET" } },
  };

  const first = await validatePreparedDeployArtifact(options);
  const second = await validatePreparedDeployArtifact(options);
  assert.equal(first.fingerprint, second.fingerprint);

  await fs.writeFile(path.join(root, "dist", "client", "asset.txt"), "asset-b\n");
  const changed = await validatePreparedDeployArtifact(options);
  assert.notEqual(changed.fingerprint, first.fingerprint);
});

test("prepared artifact validator rejects a Wrangler build hook that could create artifact B", async (t) => {
  const root = await createArtifactFixture({ buildCommand: "npm run build" });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () => validatePreparedDeployArtifact({
      root,
      canonicalResources: { d1: { binding: "DB" }, r2: { binding: "BUCKET" } },
    }),
    /must not declare build\.command/,
  );
});
