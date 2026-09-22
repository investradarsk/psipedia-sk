import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePreparedDeployArtifact } from "./validate-deploy-artifact.mjs";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const wrangler = isWindows ? "wrangler.cmd" : "wrangler";

export const DEPLOYMENT_STEPS = Object.freeze({
  configCheck: Object.freeze({ id: "config-check", command: npm, args: ["run", "config:check"] }),
  build: Object.freeze({ id: "build", command: npm, args: ["run", "build"] }),
  artifactValidation: Object.freeze({ id: "artifact-validation", command: npm, args: ["run", "validate:artifact"] }),
  remoteAudit: Object.freeze({
    id: "remote-audit",
    command: npm,
    args: ["run", "audit:breeds", "--", "--remote", "--strict"],
  }),
  deploy: Object.freeze({
    id: "deploy",
    command: wrangler,
    args: ["deploy", "--config", "dist/server/wrangler.json", "--keep-vars", "--no-bundle"],
  }),
});

export function runDeploymentCommand(step, { env = process.env } = {}) {
  console.log(`[deploy] ${step.id}: ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`[deploy] ${step.id} failed with exit code ${result.status ?? "unknown"}`);
  }
}

export async function runSafeCloudflareDeployment({
  runCommand = runDeploymentCommand,
  validateArtifact = validatePreparedDeployArtifact,
  env = process.env,
} = {}) {
  const workersBuildPreparedArtifact = env.WORKERS_CI === "1";

  // Cloudflare Workers Builds already owns the build -> deploy lifecycle.
  // Its configured build command has produced dist/ before this deploy command
  // starts, so never rebuild the artifact here.
  //
  // Do not run remote D1 migrations from Workers Builds. Cloudflare's
  // auto-generated Workers Builds token does not include D1 edit permissions,
  // so schema migration attempts here fail the whole production deployment.
  // Database/schema releases remain on the explicit manual production path
  // below, where a token with D1 permissions can run migrations before deploy.
  if (workersBuildPreparedArtifact) {
    console.log("[deploy] Workers Builds detected; deploying prepared artifact without remote D1 mutation");
    await runCommand(DEPLOYMENT_STEPS.deploy, { env });
    return Object.freeze({ fingerprint: env.WORKERS_CI_COMMIT_SHA || "workers-build-managed" });
  }

  // Phase A — prepare exactly one deploy artifact before any remote check.
  //
  // Cloudflare Workers Builds already runs the configured build command before
  // invoking the deploy command. Rebuilding here would create a second
  // application artifact inside the same Workers Build. In that environment we
  // therefore validate the artifact produced by the build phase and deploy that
  // exact artifact. Manual/local production deploys still build here first.
  await runCommand(DEPLOYMENT_STEPS.configCheck, { env });
  await runCommand(DEPLOYMENT_STEPS.build, { env });
  await runCommand(DEPLOYMENT_STEPS.artifactValidation, { env });
  const prepared = await validateArtifact({ phase: "before-remote" });
  console.log(`[deploy] prepared artifact sha256=${prepared.fingerprint}`);

  // Phase B — read-only remote gate. Production schema mutations are intentionally
  // handled by the separate manually-triggered Production D1 Migrate workflow.
  await runCommand(DEPLOYMENT_STEPS.remoteAudit, { env });

  // Revalidate identity after remote checks. This does not rebuild anything.
  const beforeDeploy = await validateArtifact({ phase: "before-deploy" });
  if (beforeDeploy.fingerprint !== prepared.fingerprint) {
    throw new Error(
      `[deploy] prepared artifact changed after validation: ${prepared.fingerprint} -> ${beforeDeploy.fingerprint}`,
    );
  }
  console.log(`[deploy] artifact identity unchanged sha256=${beforeDeploy.fingerprint}`);

  // Phase C — deploy exactly the artifact prepared above. Generated config validation
  // rejects build.command and --no-bundle prevents Wrangler from compiling a new
  // Worker bundle after the remote read-only gate.
  await runCommand(DEPLOYMENT_STEPS.deploy, { env });

  return Object.freeze({ fingerprint: prepared.fingerprint });
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await runSafeCloudflareDeployment();
}
