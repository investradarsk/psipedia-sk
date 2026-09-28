import { readFileSync } from "node:fs";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import resourceConfig from "./config/cloudflare-resources.json";
import localToolingConfig from "./config/local-cloudflare-tooling.json";
import { sites } from "./build/sites-vite-plugin";

const { d1, r2 } = hostingConfig;
const wranglerConfig = JSON.parse(
  readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8"),
) as {
  compatibility_date: string;
  version_metadata?: { binding?: string };
};

if (d1 !== resourceConfig.d1.binding) {
  throw new Error(`.openai/hosting.json D1 binding ${d1} does not match canonical ${resourceConfig.d1.binding}`);
}
if (r2 !== resourceConfig.r2.binding) {
  throw new Error(`.openai/hosting.json R2 binding ${r2} does not match canonical ${resourceConfig.r2.binding}`);
}
const versionMetadataBinding = wranglerConfig.version_metadata?.binding;
if (!versionMetadataBinding) throw new Error("wrangler.jsonc is missing version_metadata.binding");

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const isExplicitLocalE2eBootstrap = process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP === "1";

const localBindingConfig = {
  main: "./worker/index.ts",
  // Production owns its compatibility date in wrangler.jsonc. The currently
  // pinned local workerd binary cannot boot that newer date, so local Vite/
  // Miniflare uses the explicit reviewed tooling target instead of a hidden
  // literal. config:check keeps this separation visible and deterministic.
  compatibility_date: localToolingConfig.compatibility_date,
  version_metadata: { binding: versionMetadataBinding },
  // Production keeps Cloudflare Access from wrangler.jsonc. Only the explicit
  // local E2E bootstrap disables that Worker-level gate so the existing
  // localhost preview admin identity can reach the normal admin API routes.
  ...(isExplicitLocalE2eBootstrap
    ? {
        vars: {
          AUTH_MODE: "local-e2e-preview",
          MAP_UI_TEST_RENDERER: process.env.MAP_UI_TEST_RENDERER ?? "",
        },
      }
    : {}),
  d1_databases: d1
    ? [
        {
          ...resourceConfig.d1,
          // The Vite/Miniflare generated config resolves migrations relative
          // to its own location; the source contract keeps ./drizzle.
          migrations_dir: "../../drizzle",
        },
      ]
    : [],
  r2_buckets: r2 ? [resourceConfig.r2] : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
