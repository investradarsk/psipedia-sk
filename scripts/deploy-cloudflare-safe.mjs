import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePreparedDeployArtifact } from "./validate-deploy-artifact.mjs";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const wrangler = isWindows ? "wrangler.cmd" : "wrangler";

const WORKERS_BUILD_REMOTE_DB_SENSITIVE_PATHS = Object.freeze([
  "drizzle/",
  "config/cloudflare-resources.json",
  "scripts/apply-remote-d1-migrations.mjs",
]);

export function workersBuildChangedFiles(cwd = process.cwd()) {
  try {
    const output = execFileSync("git", ["diff", "--name-only", "HEAD^1", "HEAD"], {
      cwd,
      encoding: "utf8",
    });
    return output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch (error) {
    throw new Error(
      `[deploy] Workers Builds could not verify the first-parent diff; refusing a D1-less production deploy: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function workersBuildTouchesRemoteDbContract(files) {
  return files.some((file) =>
    WORKERS_BUILD_REMOTE_DB_SENSITIVE_PATHS.some((pathPrefix) =>
      pathPrefix.endsWith("/") ? file.startsWith(pathPrefix) : file === pathPrefix,
    ),
  );
}

export const DEPLOYMENT_STEPS = Object.freeze({
  configCheck: Object.freeze({ id: "config-check", command: npm, args: ["run", "config:check"] }),
  build: Object.freeze({ id: "build", command: npm, args: ["run", "build"] }),
  artifactValidation: Object.freeze({ id: "artifact-validation", command: npm, args: ["run", "validate:artifact"] }),
  remoteMigration: Object.freeze({
    id: "remote-migration",
    command: process.execPath,
    args: ["scripts/apply-remote-d1-migrations.mjs"],
  }),
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
  changedFiles = null,
} = {}) {
  const workersBuildPreparedArtifact = env.WORKERS_CI === "1";

  // Phase A — prepare exactly one deploy artifact before any remote mutation.
  //
  // Cloudflare Workers Builds already runs the configured build command before
  // invoking the deploy command. Rebuilding here would create a second
  // application artifact inside the same Workers Build. In that environment we
  // therefore validate the artifact produced by the build phase and deploy that
  // exact artifact. Manual/local production deploys still build here first.
  await runCommand(DEPLOYMENT_STEPS.configCheck, { env });
  if (!workersBuildPreparedArtifact) {
    await runCommand(DEPLOYMENT_STEPS.build, { env });
  } else {
    console.log("[deploy] Workers Builds detected; reusing prepared build artifact");
  }
  await runCommand(DEPLOYMENT_STEPS.artifactValidation, { env });
  const prepared = await validateArtifact({ phase: "before-remote" });
  console.log(`[deploy] prepared artifact sha256=${prepared.fingerprint}`);

  // Phase B — remote DB gate.
  //
  // Cloudflare's managed Workers Builds token is sufficient for Worker deploys,
  // but remote D1 access is not guaranteed. For code-only Workers Builds we
  // therefore skip the remote D1 gate and deploy the already-validated artifact.
  // If the current merge changes migrations or the canonical D1 contract, fail
  // closed and require the manual production deploy path, which retains the full
  // migration + audit gate.
  if (workersBuildPreparedArtifact) {
    const workersChangedFiles = changedFiles ?? workersBuildChangedFiles();
    if (workersBuildTouchesRemoteDbContract(workersChangedFiles)) {
      throw new Error(
        "[deploy] Workers Builds change touches the remote D1 contract; use the manual production deploy so migrations and the remote audit run before deploy",
      );
    }
    console.log("[deploy] Workers Builds code-only deploy; skipping remote D1 migration/audit gate");
  } else {
    await runCommand(DEPLOYMENT_STEPS.remoteMigration, { env });
    await runCommand(DEPLOYMENT_STEPS.remoteAudit, { env });
  }

  // Revalidate identity after remote operations. This does not rebuild anything.
  const beforeDeploy = await validateArtifact({ phase: "before-deploy" });
  if (beforeDeploy.fingerprint !== prepared.fingerprint) {
    throw new Error(
      `[deploy] prepared artifact changed after validation: ${prepared.fingerprint} -> ${beforeDeploy.fingerprint}`,
    );
  }
  console.log(`[deploy] artifact identity unchanged sha256=${beforeDeploy.fingerprint}`);

  // Phase C — deploy exactly the artifact prepared above. Generated config validation
  // rejects build.command and --no-bundle prevents Wrangler from compiling a new
  // Worker bundle after the remote DB gate.
  await runCommand(DEPLOYMENT_STEPS.deploy, { env });

  return Object.freeze({ fingerprint: prepared.fingerprint });
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await runSafeCloudflareDeployment();
}
